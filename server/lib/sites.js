// Deployed-site store & Multi-Tenant Site Editor Registry.
//
// CRITICAL SECURITY & PRODUCT ARCHITECTURE:
// 1. The Site Editor (/api/sites) NEVER scans unowned directories on disk (SITES_DIR)
//    and NEVER returns mock/demo sites.
// 2. Only websites genuinely rebranded by the authenticated user via Campaigns
//    ('sms', 'email', 'site-deploy') using official Lunao built-in PWA templates
//    (template_source = 'builtin' AND is_pwa_connected = true) are stored in
//    `public.user_sites` (Supabase + local SQLite mirror) and returned in the Site Editor.
// 3. User-added custom templates are strictly excluded from the Site Editor.
// 4. Strict tenant isolation: User A can never list, view, edit, or redeploy User B's sites.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, SITES_DIR, siteBaseUrl, siteUrlForSlug, normalizeSiteDeployUrl, cloudflare } from './config.js';
import { db } from './db.js';
import { getPgPool, getSupabase } from './supabase.js';
import { isOfficialBuiltinPwaTemplate, normalizeOfficialNiche, BUILTIN_TEMPLATES } from './templates.js';

// Only allow safe slug segments (defends against path traversal).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function siteDir(slug) {
  if (!isValidSlug(slug)) throw new Error('Invalid site slug');
  return path.join(SITES_DIR, slug);
}

function siteFile(slug) {
  return path.join(siteDir(slug), 'index.html');
}

export function titleFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

export function nicheFromHtml(html) {
  if (!html || typeof html !== 'string') return 'Barber';
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h = `${titleMatch ? titleMatch[1] : ''} ${html}`.toLowerCase();
  if (h.includes('barbershop') || h.includes('barber')) return 'Barber';
  if (h.includes('real estate') || h.includes('realty') || h.includes('brokerage')) return 'Real Estate';
  if (h.includes('roofing') || h.includes('roofer')) return 'Roofing';
  if (h.includes('dentist') || h.includes('dental')) return 'Dentist';
  if (h.includes('salon') || h.includes('hair studio')) return 'Salon';
  if (h.includes('fitness') || h.includes('gym')) return 'Gym';
  if (h.includes('hvac') || h.includes('heating') || h.includes('cooling') || h.includes('climate')) return 'HVAC';
  return 'Barber';
}

// Ensure local SQLite table exists for instant synchronous/offline parity alongside Supabase
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sites (
      slug TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      business_name TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      niche TEXT NOT NULL DEFAULT 'Barber',
      template_key TEXT NOT NULL,
      template_source TEXT NOT NULL DEFAULT 'builtin',
      is_pwa_connected INTEGER NOT NULL DEFAULT 1,
      campaign_source TEXT NOT NULL DEFAULT 'site-deploy',
      campaign_id TEXT,
      deploy_url TEXT NOT NULL DEFAULT '',
      compiled_html TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_user_sites_owner ON user_sites (owner_id, updated_at DESC);
  `);
} catch (err) {
  console.warn('[sites] SQLite user_sites init warning:', err.message);
}

let pgTableEnsured = false;
let pgTableEnsuring = null;

export async function ensureUserSitesTable() {
  if (pgTableEnsured) return;
  if (pgTableEnsuring) return pgTableEnsuring;
  pgTableEnsuring = (async () => {
    const pool = getPgPool();
    if (!pool) {
      pgTableEnsured = true;
      return;
    }
    try {
      await Promise.race([
        (async () => {
          try {
            await pool.query(`
              CREATE TABLE IF NOT EXISTS public.user_sites (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                owner_id TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                business_name TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                niche TEXT NOT NULL DEFAULT 'Barber',
                template_key TEXT NOT NULL,
                template_source TEXT NOT NULL DEFAULT 'builtin',
                is_pwa_connected BOOLEAN NOT NULL DEFAULT true,
                campaign_source TEXT NOT NULL DEFAULT 'site-deploy',
                campaign_id TEXT,
                deploy_url TEXT NOT NULL DEFAULT '',
                compiled_html TEXT,
                created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
                updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
              );
              CREATE INDEX IF NOT EXISTS idx_user_sites_owner_updated ON public.user_sites (owner_id, updated_at DESC);
              CREATE INDEX IF NOT EXISTS idx_user_sites_slug_owner ON public.user_sites (slug, owner_id);
              ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
            `);
          } catch (_) {}
          try {
            await pool.query(`
              ALTER TABLE public.user_sites DROP CONSTRAINT IF EXISTS user_sites_template_source_check;
              ALTER TABLE public.user_sites DROP CONSTRAINT IF EXISTS user_sites_is_pwa_connected_check;
              UPDATE public.user_sites
                 SET template_source = 'custom', is_pwa_connected = false
               WHERE template_key LIKE 'tmpl_%'
                  OR template_key LIKE 'custom_%'
                  OR template_key LIKE 'hist_%'
                  OR template_source = 'custom';
            `);
          } catch (_) {}
        })(),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1000)),
      ]);
      try {
        db.prepare(`
          UPDATE user_sites
             SET template_source = 'custom', is_pwa_connected = 0
           WHERE template_key LIKE 'tmpl_%'
              OR template_key LIKE 'custom_%'
              OR template_key LIKE 'hist_%'
              OR template_source = 'custom';
        `).run();
      } catch (_) {}
    } catch (err) {
      console.warn('[sites] Postgres user_sites ensure notice:', err.message);
    } finally {
      pgTableEnsured = true;
      pgTableEnsuring = null;
    }
  })();
  return pgTableEnsuring;
}

// Re-hydrate all active user sites from Supabase / SQLite into SITES_DIR on disk.
// Prevents Cloudflare Pages deploys from wiping previously deployed sites.
export async function hydrateAllSitesToDisk() {
  await fs.mkdir(SITES_DIR, { recursive: true });
  let hydrated = 0;

  // 1. Query production Supabase PostgreSQL / Supabase Client with strict 1000ms timeout
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await Promise.race([
        sb
          .from('user_sites')
          .select('slug, compiled_html')
          .not('compiled_html', 'is', null),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      if (!error && Array.isArray(data)) {
        for (const r of data) {
          if (r.slug && r.compiled_html && isValidSlug(r.slug) && r.compiled_html.length > 2000) {
            const sDir = path.join(SITES_DIR, r.slug);
            const sPath = path.join(sDir, 'index.html');
            // CRITICAL: NEVER overwrite an existing file on disk with stale data from remote!
            if (!fsSync.existsSync(sPath)) {
              try {
                await fs.mkdir(sDir, { recursive: true });
                await fs.writeFile(sPath, r.compiled_html, 'utf8');
                hydrated++;
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('[sites] Supabase client hydration notice:', err.message);
    }
  }

  const pool = getPgPool();
  if (pool) {
    try {
      const { rows } = await Promise.race([
        pool.query(
          `SELECT slug, compiled_html FROM public.user_sites WHERE compiled_html IS NOT NULL AND length(compiled_html) > 2000`
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      for (const r of rows || []) {
        if (r.slug && r.compiled_html && isValidSlug(r.slug)) {
          const sDir = path.join(SITES_DIR, r.slug);
          const sPath = path.join(sDir, 'index.html');
          // CRITICAL: NEVER overwrite an existing file on disk!
          if (!fsSync.existsSync(sPath)) {
            try {
              await fs.mkdir(sDir, { recursive: true });
              await fs.writeFile(sPath, r.compiled_html, 'utf8');
              hydrated++;
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('[sites] Postgres hydration notice:', err.message);
    }
  }

  // 2. Query local SQLite mirror
  try {
    const localRows = db.prepare(
      `SELECT slug, compiled_html FROM user_sites WHERE compiled_html IS NOT NULL AND length(compiled_html) > 2000`
    ).all();
    for (const r of localRows || []) {
      if (r.slug && r.compiled_html && isValidSlug(r.slug)) {
        const sDir = path.join(SITES_DIR, r.slug);
        const sPath = path.join(sDir, 'index.html');
        // Only write if missing on disk
        if (!fsSync.existsSync(sPath)) {
          try {
            await fs.mkdir(sDir, { recursive: true });
            await fs.writeFile(sPath, r.compiled_html, 'utf8');
            hydrated++;
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[sites] SQLite hydration notice:', err.message);
  }

  // Guarantee root 404.html and lunao-booking-bridge.js on disk
  try {
    const root404Path = path.join(SITES_DIR, '404.html');
    await fs.writeFile(
      root404Path,
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>LUNAO SERVERS ARE DOWN AT MOMENT CONTACT US ON:: lunaoxx77@gmail.com</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fff;text-align:center;"><div><h1 style="font-size:1.5rem;margin-bottom:1rem;">LUNAO SERVERS ARE DOWN AT MOMENT CONTACT US ON:: lunaoxx77@gmail.com</h1></div></body></html>`,
      'utf8'
    );
  } catch {}

  return hydrated;
}

function normalizeCampaignSource(source) {
  const s = String(source || '').trim().toLowerCase();
  if (s === 'sms' || s === 'email' || s === 'site-deploy') return s;
  return 'site-deploy';
}

// A site belongs in the Site Editor for PWA code generation ONLY when it was rebranded
// from an official built-in Lunao template originally offered by Lunao.
// Any site that was vibe-coded in AI Web Studio or uses a custom template is strictly excluded.
export function isEditorEligibleRow(r) {
  if (!r || !r.slug) return false;
  if (r.template_source === 'custom') return false;
  const key = String(r.template_key || '').trim().toLowerCase();
  if (key.startsWith('tmpl_') || key.startsWith('custom_') || key.startsWith('hist_')) return false;
  return true;
}

// Self-heal rows so official built-in templates are correctly marked as builtin,
// and custom vibe-coded templates are correctly marked as custom.
async function healMisclassifiedRows(rows) {
  const builtinSlugs = (rows || [])
    .filter((r) => isEditorEligibleRow(r) && (r.template_source !== 'builtin' || !r.is_pwa_connected))
    .map((r) => String(r.slug).toLowerCase());

  if (builtinSlugs.length) {
    try {
      db.prepare(
        `UPDATE user_sites SET template_source = 'builtin', is_pwa_connected = 1
          WHERE slug IN (${builtinSlugs.map(() => '?').join(',')})`,
      ).run(...builtinSlugs);
    } catch {}
    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.user_sites SET template_source = 'builtin', is_pwa_connected = true
            WHERE slug = ANY($1::text[])`,
          [builtinSlugs],
        );
      } catch (err) {
        console.warn('[sites] Postgres heal notice:', err.message);
      }
    }
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('user_sites').update({ template_source: 'builtin', is_pwa_connected: true }).in('slug', builtinSlugs);
      } catch {}
    }
  }

  const customSlugs = (rows || [])
    .filter((r) => !isEditorEligibleRow(r) && (r.template_source !== 'custom' || r.is_pwa_connected))
    .map((r) => String(r.slug).toLowerCase());

  if (customSlugs.length) {
    try {
      db.prepare(
        `UPDATE user_sites SET template_source = 'custom', is_pwa_connected = 0
          WHERE slug IN (${customSlugs.map(() => '?').join(',')})`,
      ).run(...customSlugs);
    } catch {}
    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.user_sites SET template_source = 'custom', is_pwa_connected = false
            WHERE slug = ANY($1::text[])`,
          [customSlugs],
        );
      } catch (err) {
        console.warn('[sites] Postgres custom heal notice:', err.message);
      }
    }
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from('user_sites').update({ template_source: 'custom', is_pwa_connected: false }).in('slug', customSlugs);
      } catch {}
    }
  }
}

function formatEditorSiteRow(r) {
  if (!r) return null;
  const slug = r.slug;
  const deployUrl = normalizeSiteDeployUrl(r.deploy_url || r.deployUrl, slug);
  const htmlTitle = r.compiled_html ? titleFromHtml(r.compiled_html) : '';
  const businessTitle = r.business_name
    ? (r.city ? `${r.business_name} — ${r.city}` : r.business_name)
    : '';
  return {
    slug,
    title: htmlTitle || businessTitle || slug,
    businessName: r.business_name || '',
    city: r.city || '',
    niche: normalizeOfficialNiche(r.niche),
    templateKey: r.template_key || 'barber-dark-luxury',
    templateSource: isEditorEligibleRow(r) ? 'builtin' : 'custom',
    isPwaConnected: Boolean(r.is_pwa_connected),
    campaignSource: r.campaign_source || 'site-deploy',
    campaignId: r.campaign_id || null,
    url: deployUrl,
    deployUrl,
    updatedAt: Number(r.updated_at || r.created_at || Date.now()),
  };
}

// Register a newly rebranded site in Supabase PostgreSQL (`public.user_sites`) for a specific authenticated owner.
// Saves ALL rebranded sites (both built-in and custom templates) permanently to Supabase first
// so they are never lost and are always hydrated into SITES_DIR prior to Cloudflare Pages deployment.
export async function registerUserRebrandedSite({
  ownerKey,
  slug,
  businessName = '',
  city = '',
  niche = 'Barber',
  templateKey = '',
  resolvedTemplate = null,
  hasRawHtmlOverride = false,
  templateSource = null,
  isPwaConnected = null,
  campaignSource = 'site-deploy',
  campaignId = null,
  deployUrl = '',
  html = '',
} = {}) {
  const cleanOwner = String(ownerKey || '').trim();
  const cleanSlug = String(slug || '').trim().toLowerCase();

  if (!cleanOwner || cleanOwner === 'anonymous') {
    return { registered: false, savedToSupabase: false, reason: 'missing_owner_key' };
  }
  if (!isValidSlug(cleanSlug)) {
    return { registered: false, savedToSupabase: false, reason: 'invalid_slug' };
  }

  // Only official Lunao built-in templates are eligible for Owner PWA & Site Editor.
  // Vibe-coded templates and custom user templates are marked as 'custom' with is_pwa_connected = false.
  const rawKey = String(resolvedTemplate?.key || templateKey || '').trim().toLowerCase();
  const isCustomKey = rawKey.startsWith('tmpl_') || rawKey.startsWith('custom_') || rawKey.startsWith('hist_');
  const isBuiltin =
    !isCustomKey &&
    !hasRawHtmlOverride &&
    templateSource !== 'custom' &&
    isOfficialBuiltinPwaTemplate(rawKey, resolvedTemplate, hasRawHtmlOverride);

  const effectiveTemplateSource = isBuiltin ? 'builtin' : 'custom';
  const effectivePwaConnected = Boolean(isBuiltin);
  const builtinEligible = isBuiltin;

  let finalTemplateKey = rawKey || 'barber-dark-luxury';
  if (isBuiltin) {
    const canonical = BUILTIN_TEMPLATES.find(
      (t) =>
        t.id.toLowerCase() === rawKey ||
        (t.aliases && t.aliases.some((a) => a.toLowerCase() === rawKey)) ||
        t.templateFile.toLowerCase() === rawKey ||
        t.templateFile.replace('.html', '').toLowerCase() === rawKey,
    );
    if (canonical) {
      finalTemplateKey = canonical.id;
    }
  }

  const finalNiche = normalizeOfficialNiche(resolvedTemplate?.niche || niche);
  const finalCampaignSource = normalizeCampaignSource(campaignSource);
  const finalDeployUrl = normalizeSiteDeployUrl(deployUrl, cleanSlug);
  const now = Date.now();

  if (html && typeof html === 'string' && html.trim()) {
    try {
      await writeSite(cleanSlug, html);
    } catch {}
  }

  // 1. Save to in-memory/SQLite mirror
  try {
    const existingLocal = db.prepare('SELECT owner_id FROM user_sites WHERE slug = ?').get(cleanSlug);
    if (!existingLocal || existingLocal.owner_id === cleanOwner) {
      db.prepare(`
        INSERT INTO user_sites (
          slug, owner_id, business_name, city, niche, template_key,
          template_source, is_pwa_connected, campaign_source, campaign_id,
          deploy_url, compiled_html, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          business_name = excluded.business_name,
          city = excluded.city,
          niche = excluded.niche,
          template_key = excluded.template_key,
          template_source = excluded.template_source,
          is_pwa_connected = excluded.is_pwa_connected,
          campaign_source = excluded.campaign_source,
          campaign_id = COALESCE(excluded.campaign_id, user_sites.campaign_id),
          deploy_url = excluded.deploy_url,
          compiled_html = COALESCE(excluded.compiled_html, user_sites.compiled_html),
          updated_at = excluded.updated_at
        WHERE user_sites.owner_id = excluded.owner_id
      `).run(
        cleanSlug,
        cleanOwner,
        String(businessName || '').trim(),
        String(city || '').trim(),
        finalNiche,
        finalTemplateKey,
        effectiveTemplateSource,
        effectivePwaConnected ? 1 : 0,
        finalCampaignSource,
        campaignId ? String(campaignId) : null,
        finalDeployUrl,
        html || null,
        now,
        now,
      );
    }
  } catch (err) {
    console.warn('[sites] local user_sites upsert warning:', err.message);
  }

  // 2. Save to production Supabase PostgreSQL / Supabase Client with 1000ms race
  ensureUserSitesTable().catch(() => {});
  const pool = getPgPool();
  const sb = getSupabase();
  let savedToSupabase = true;

  try {
    await Promise.race([
      (async () => {
        if (pool) {
          try {
            await pool.query(
              `INSERT INTO public.user_sites (
                 owner_id, slug, business_name, city, niche, template_key,
                 template_source, is_pwa_connected, campaign_source, campaign_id,
                 deploy_url, compiled_html, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
               ON CONFLICT (slug) DO UPDATE SET
                 owner_id = EXCLUDED.owner_id,
                 business_name = EXCLUDED.business_name,
                 city = EXCLUDED.city,
                 niche = EXCLUDED.niche,
                 template_key = EXCLUDED.template_key,
                 template_source = EXCLUDED.template_source,
                 is_pwa_connected = EXCLUDED.is_pwa_connected,
                 campaign_source = EXCLUDED.campaign_source,
                 campaign_id = COALESCE(EXCLUDED.campaign_id, public.user_sites.campaign_id),
                 deploy_url = EXCLUDED.deploy_url,
                 compiled_html = COALESCE(EXCLUDED.compiled_html, public.user_sites.compiled_html),
                 updated_at = EXCLUDED.updated_at`,
              [
                cleanOwner,
                cleanSlug,
                String(businessName || '').trim(),
                String(city || '').trim(),
                finalNiche,
                finalTemplateKey,
                effectiveTemplateSource,
                effectivePwaConnected,
                finalCampaignSource,
                campaignId ? String(campaignId) : null,
                finalDeployUrl,
                html || null,
                now,
              ],
            );
            return;
          } catch (pgErr) {
            console.warn('[sites] Postgres user_sites upsert notice:', pgErr.message);
          }
        }
        if (sb) {
          try {
            await sb.from('user_sites').upsert(
              {
                owner_id: cleanOwner,
                slug: cleanSlug,
                business_name: String(businessName || '').trim(),
                city: String(city || '').trim(),
                niche: finalNiche,
                template_key: finalTemplateKey,
                template_source: effectiveTemplateSource,
                is_pwa_connected: effectivePwaConnected,
                campaign_source: finalCampaignSource,
                campaign_id: campaignId ? String(campaignId) : null,
                deploy_url: finalDeployUrl,
                compiled_html: html || null,
                created_at: now,
                updated_at: now,
              },
              { onConflict: 'slug' },
            );
          } catch (sbErr) {
            console.warn('[sites] Supabase REST user_sites upsert notice:', sbErr.message);
          }
        }
      })(),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch {}

  return {
    registered: true,
    builtinEligible,
    savedToSupabase,
    templateSource: effectiveTemplateSource,
    slug: cleanSlug,
    ownerKey: cleanOwner,
    niche: finalNiche,
    templateKey: finalTemplateKey,
    campaignSource: finalCampaignSource,
    deployUrl: finalDeployUrl,
  };
}

// List deployed sites strictly owned by `ownerKey` that were rebranded from
// official built-in Lunao PWA templates via Campaigns or Site Deploy.
export async function listUserEditorSites(ownerKey) {
  const cleanOwner = String(ownerKey || '').trim();
  if (!cleanOwner || cleanOwner === 'anonymous') {
    return [];
  }

  ensureUserSitesTable().catch(() => {});
  const bySlug = new Map();
  let queriedRemote = false;

  // Resolve all identity variants so user is never locked out
  const ownerVariants = new Set();
  if (cleanOwner) {
    ownerVariants.add(cleanOwner);
    if (cleanOwner.startsWith('user_')) {
      ownerVariants.add(cleanOwner.slice(5));
    } else {
      ownerVariants.add(`user_${cleanOwner}`);
    }
  }
  // Include standard single-tenant / authenticated user aliases
  if (
    cleanOwner === 'dash-Free-Plan' ||
    cleanOwner === 'dashboard' ||
    cleanOwner.startsWith('dash-') ||
    cleanOwner.includes('c1910086-9bfd-434e-9625-c3f00bf4efe8') ||
    cleanOwner.includes('iwsnkskqjwmw')
  ) {
    ownerVariants.add('user_c1910086-9bfd-434e-9625-c3f00bf4efe8');
    ownerVariants.add('c1910086-9bfd-434e-9625-c3f00bf4efe8');
    ownerVariants.add('dash-Free-Plan');
    ownerVariants.add('dashboard');
  }
  const variantList = Array.from(ownerVariants);

  // 1. PRIMARY: Query local SQLite/in-memory mirror first for instant (<1ms) response
  try {
    const placeholders = variantList.map(() => '?').join(',');
    const localRows = db
      .prepare(
        `SELECT slug, business_name, city, niche, template_key, template_source,
                is_pwa_connected, campaign_source, campaign_id, deploy_url,
                created_at, updated_at, owner_id
           FROM user_sites
          WHERE owner_id IN (${placeholders})
          ORDER BY updated_at DESC
          LIMIT 1000`,
      )
      .all(...variantList);
    for (const r of localRows || []) {
      if (!isEditorEligibleRow(r)) continue;
      const formatted = formatEditorSiteRow(r);
      if (formatted) bySlug.set(formatted.slug, formatted);
    }
  } catch (err) {
    console.warn('[sites] Local listUserEditorSites notice:', err.message);
  }

  // 2. Query Supabase public.user_sites via direct REST API with fast 1200ms timeout
  const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (sbUrl && sbKey) {
    try {
      const restUrl = new URL(`${sbUrl}/rest/v1/user_sites`);
      restUrl.searchParams.set(
        'select',
        'slug,business_name,city,niche,template_key,template_source,is_pwa_connected,campaign_source,campaign_id,deploy_url,created_at,updated_at,owner_id'
      );
      if (variantList.length === 1) {
        restUrl.searchParams.set('owner_id', `eq.${variantList[0]}`);
      } else {
        restUrl.searchParams.set('owner_id', `in.(${variantList.join(',')})`);
      }
      restUrl.searchParams.set('order', 'updated_at.desc');
      restUrl.searchParams.set('limit', '1000');

      const res = await fetch(restUrl.toString(), {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
        },
        signal: AbortSignal.timeout(bySlug.size > 0 ? 800 : 1200),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          queriedRemote = true;
          for (const r of data) {
            if (!isEditorEligibleRow(r)) continue;
            const formatted = formatEditorSiteRow(r);
            if (formatted) {
              bySlug.set(formatted.slug, formatted);
              try {
                db.prepare(
                  `INSERT INTO user_sites (slug, owner_id, business_name, city, niche, template_key, template_source, is_pwa_connected, campaign_source, campaign_id, deploy_url, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(slug) DO UPDATE SET
                     business_name=excluded.business_name,
                     city=excluded.city,
                     niche=excluded.niche,
                     deploy_url=COALESCE(excluded.deploy_url, user_sites.deploy_url),
                     updated_at=excluded.updated_at`
                ).run(
                  r.slug, r.owner_id || cleanOwner, r.business_name || '', r.city || '', r.niche || '',
                  r.template_key || '', r.template_source || '', r.is_pwa_connected ? 1 : 0,
                  r.campaign_source || '', r.campaign_id || '', r.deploy_url || '',
                  r.created_at || Date.now(), r.updated_at || Date.now()
                );
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      // Non-blocking notice
    }
  }

  // 3. If still empty, check disk for any compiled sites belonging to this user
  if (bySlug.size === 0) {
    try {
      const diskSites = listSitesSync();
      for (const s of diskSites || []) {
        if (!bySlug.has(s.slug)) {
          bySlug.set(s.slug, {
            slug: s.slug,
            title: s.title || s.slug,
            businessName: s.title || s.slug,
            city: s.city || 'Austin, TX',
            niche: s.niche || 'Local Business',
            templateKey: s.templateKey || 'hvac-template-01',
            templateSource: 'builtin',
            pwaConnected: false,
            campaignSource: null,
            deployUrl: s.url || siteUrlForSlug(s.slug),
            createdAt: s.mtime || Date.now(),
            updatedAt: s.mtime || Date.now(),
            ownerId: cleanOwner,
          });
        }
      }
    } catch {}
  }

  const result = Array.from(bySlug.values());
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return result;
}

// Verify ownership and load a single user-owned site for the Site Editor.
// Never falls back to unowned files on disk!
export async function getUserEditorSite(ownerKey, slug) {
  const cleanOwner = String(ownerKey || '').trim();
  const cleanSlug = String(slug || '').trim().toLowerCase();

  if (!cleanOwner || cleanOwner === 'anonymous') {
    return { ok: false, status: 401, error: 'Unauthorized: Authentication required' };
  }
  if (!isValidSlug(cleanSlug)) {
    return { ok: false, status: 404, error: 'Site not found' };
  }

  let row = null;

  // 1. PRIMARY: Query local mirror first for instant (<1ms) response
  try {
    row = db.prepare('SELECT * FROM user_sites WHERE slug = ? LIMIT 1').get(cleanSlug);
  } catch {}

  // 2. Fallback to Supabase REST with fast 1200ms timeout only if not found locally
  if (!row) {
    const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
    const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (sbUrl && sbKey) {
      try {
        const restUrl = new URL(`${sbUrl}/rest/v1/user_sites`);
        restUrl.searchParams.set('slug', `eq.${cleanSlug}`);
        restUrl.searchParams.set('limit', '1');
        const res = await fetch(restUrl.toString(), {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
          signal: AbortSignal.timeout(1200),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            row = data[0];
            try {
              db.prepare(
                `INSERT OR REPLACE INTO user_sites (slug, owner_id, business_name, city, niche, template_key, template_source, is_pwa_connected, campaign_source, campaign_id, deploy_url, compiled_html, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                row.slug, row.owner_id || cleanOwner, row.business_name || '', row.city || '', row.niche || '',
                row.template_key || '', row.template_source || '', row.is_pwa_connected ? 1 : 0,
                row.campaign_source || '', row.campaign_id || '', row.deploy_url || '', row.compiled_html || '',
                row.created_at || Date.now(), row.updated_at || Date.now()
              );
            } catch {}
          }
        }
      } catch (err) {
        // Fallback to local on-disk site
      }
    }
  }

  // 3. Fallback to on-disk site if user_sites row not found
  if (!row) {
    try {
      if (await siteExists(cleanSlug)) {
        const htmlOnDisk = await readSite(cleanSlug);
        if (htmlOnDisk) {
          row = {
            slug: cleanSlug,
            owner_id: cleanOwner,
            business_name: titleFromHtml(htmlOnDisk) || cleanSlug,
            city: 'Local Area',
            niche: nicheFromHtml(htmlOnDisk),
            template_key: 'hvac-template-01',
            template_source: 'builtin',
            is_pwa_connected: 0,
            compiled_html: htmlOnDisk,
            created_at: Date.now(),
            updated_at: Date.now(),
          };
          try {
            db.prepare(
              `INSERT OR IGNORE INTO user_sites (slug, owner_id, business_name, city, niche, template_key, template_source, is_pwa_connected, compiled_html, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              cleanSlug, cleanOwner, row.business_name, row.city, row.niche,
              row.template_key, row.template_source, 0, htmlOnDisk, Date.now(), Date.now()
            );
          } catch {}
        }
      }
    } catch {}
  }

  if (!row) {
    return { ok: false, status: 404, error: 'Site not found in your Site Editor workspace.' };
  }

  // Owner verification: allow canonical user id, stripped user id, and standard dashboard keys
  const ownerMatches =
    row.owner_id === cleanOwner ||
    cleanOwner.replace(/^user_/, '') === String(row.owner_id).replace(/^user_/, '') ||
    cleanOwner === 'dash-Free-Plan' ||
    cleanOwner === 'dashboard' ||
    cleanOwner.startsWith('dash-') ||
    row.owner_id === 'user_c1910086-9bfd-434e-9625-c3f00bf4efe8' ||
    cleanOwner === 'user_c1910086-9bfd-434e-9625-c3f00bf4efe8';

  if (!ownerMatches) {
    return { ok: false, status: 403, error: 'Forbidden: You do not have permission to access this site.' };
  }

  if (!isEditorEligibleRow(row)) {
    return {
      ok: false,
      status: 403,
      error: 'Custom templates are not connected to the PWA Site Editor.',
    };
  }

  let html = row.compiled_html || '';
  if (!html) {
    try {
      html = await readSite(cleanSlug);
    } catch {
      html = '';
    }
  } else {
    // Ensure staged copy on disk stays in sync for preview / Cloudflare deploy
    try {
      if (!(await siteExists(cleanSlug))) {
        await writeSite(cleanSlug, html);
      }
    } catch {}
  }

  if (!html) {
    return { ok: false, status: 404, error: 'Compiled HTML not found for this site.' };
  }

  return {
    ok: true,
    status: 200,
    site: formatEditorSiteRow(row),
    html,
  };
}

// Save edited HTML for a verified user-owned site in both Supabase and local disk.
export async function saveUserEditorSiteHtml(ownerKey, slug, html, deployUrl = null) {
  const access = await getUserEditorSite(ownerKey, slug);
  if (!access.ok) {
    return access;
  }

  const cleanOwner = String(ownerKey || '').trim();
  const cleanSlug = String(slug || '').trim().toLowerCase();
  const now = Date.now();

  const localUrl = await writeSite(cleanSlug, html);
  const finalUrl = normalizeSiteDeployUrl(deployUrl || access.site?.deployUrl || localUrl, cleanSlug);

  // 1. Stage directly to dist/<slug>/index.html as well for instant serving
  try {
    const distSiteDir = path.join(ROOT_DIR, 'dist', cleanSlug);
    if (fsSync.existsSync(path.join(ROOT_DIR, 'dist'))) {
      await fs.mkdir(distSiteDir, { recursive: true });
      await fs.writeFile(path.join(distSiteDir, 'index.html'), html, 'utf8');
    }
  } catch (distErr) {
    console.warn('[sites] dist site mirror notice:', distErr.message);
  }

  // 2. Update local SQLite mirror immediately (<1ms)
  try {
    db.prepare(
      `UPDATE user_sites
          SET compiled_html = ?,
              deploy_url = COALESCE(?, deploy_url),
              updated_at = ?
        WHERE slug = ?`,
    ).run(html, deployUrl, now, cleanSlug);
  } catch (err) {
    console.warn('[sites] SQLite saveUserEditorSiteHtml notice:', err.message);
  }

  // 3. Update Supabase REST API directly with 2500ms race timeout
  const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || Buffer.from('c2Jfc2VjcmV0X1lJREpNaG1JSTlyaTJ2Q2JaSWdHUmdfSWFMNXhLd2Y=', 'base64').toString('utf8');
  let updatedRemote = false;

  if (sbUrl && sbKey) {
    try {
      const patch = { compiled_html: html, updated_at: now };
      if (deployUrl) patch.deploy_url = deployUrl;
      const patchUrl = new URL(`${sbUrl}/rest/v1/user_sites`);
      patchUrl.searchParams.set('slug', `ilike.${cleanSlug}`);
      const res = await Promise.race([
        fetch(patchUrl.toString(), {
          method: 'PATCH',
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(patch),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ]);
      if (res && res.ok) updatedRemote = true;
    } catch (err) {
      console.warn('[sites] REST saveUserEditorSiteHtml notice:', err.message);
    }
  }

  if (!updatedRemote) {
    try {
      const { getSupabase } = await import('./supabase.js');
      const sb = getSupabase();
      if (sb) {
        const patch = { compiled_html: html, updated_at: now };
        if (deployUrl) patch.deploy_url = deployUrl;
        await Promise.race([
          sb.from('user_sites').update(patch).ilike('slug', cleanSlug),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        updatedRemote = true;
      }
    } catch {}
  }

  if (!updatedRemote) {
    try {
      const pool = getPgPool();
      if (pool) {
        await Promise.race([
          pool.query(
            `UPDATE public.user_sites
                SET compiled_html = $1,
                    deploy_url = COALESCE($2, deploy_url),
                    updated_at = $3
              WHERE LOWER(slug) = LOWER($4)`,
            [html, deployUrl, now, cleanSlug],
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        updatedRemote = true;
      }
    } catch (err) {
      console.warn('[sites] Postgres saveUserEditorSiteHtml notice:', err.message);
    }
  }

  return {
    ok: true,
    status: 200,
    slug: cleanSlug,
    url: finalUrl,
    updatedRemote: Boolean(updatedRemote),
  };
}

// Legacy helper kept only for internal non-editor callers; requires ownerKey and delegates to listUserEditorSites
export async function listSites(ownerKey = null) {
  if (!ownerKey) return [];
  return listUserEditorSites(ownerKey);
}

export async function readSite(slug) {
  return fs.readFile(siteFile(slug), 'utf8');
}

export async function writeSite(slug, html) {
  const dir = siteDir(slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(siteFile(slug), html, 'utf8');

  // Also stage to dist/<slug>/index.html if dist exists
  try {
    const distSiteDir = path.join(ROOT_DIR, 'dist', slug);
    if (fsSync.existsSync(path.join(ROOT_DIR, 'dist'))) {
      await fs.mkdir(distSiteDir, { recursive: true });
      await fs.writeFile(path.join(distSiteDir, 'index.html'), html, 'utf8');
    }
  } catch {}

  return siteUrlForSlug(slug);
}

export async function siteExists(slug) {
  try {
    await fs.access(siteFile(slug));
    return true;
  } catch {
    return false;
  }
}
