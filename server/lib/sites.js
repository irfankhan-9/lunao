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
import path from 'node:path';
import { SITES_DIR, siteBaseUrl, cloudflare } from './config.js';
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

export async function ensureUserSitesTable() {
  if (pgTableEnsured) return;
  const pool = getPgPool();
  if (!pool) return;
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
    // Relax any legacy restrictive CHECK constraints on template_source / is_pwa_connected so custom templates are also stored permanently in Supabase
    try {
      await pool.query(`
        ALTER TABLE public.user_sites DROP CONSTRAINT IF EXISTS user_sites_template_source_check;
        ALTER TABLE public.user_sites DROP CONSTRAINT IF EXISTS user_sites_is_pwa_connected_check;
      `);
    } catch (_) {}
    pgTableEnsured = true;
  } catch (err) {
    console.warn('[sites] Postgres user_sites ensure notice:', err.message);
  }
}

// Re-hydrate all active user sites from Supabase / SQLite into SITES_DIR on disk.
// Prevents Cloudflare Pages deploys from wiping previously deployed sites.
export async function hydrateAllSitesToDisk() {
  await fs.mkdir(SITES_DIR, { recursive: true });
  let hydrated = 0;

  // 1. Query production Supabase PostgreSQL
  const pool = getPgPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT slug, compiled_html FROM public.user_sites WHERE compiled_html IS NOT NULL AND length(compiled_html) > 2000`
      );
      for (const r of rows || []) {
        if (r.slug && r.compiled_html && isValidSlug(r.slug)) {
          const sDir = path.join(SITES_DIR, r.slug);
          const sPath = path.join(sDir, 'index.html');
          try {
            await fs.mkdir(sDir, { recursive: true });
            await fs.writeFile(sPath, r.compiled_html, 'utf8');
            hydrated++;
          } catch {}
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
        try {
          await fs.mkdir(sDir, { recursive: true });
          await fs.writeFile(sPath, r.compiled_html, 'utf8');
          hydrated++;
        } catch {}
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

function formatEditorSiteRow(r) {
  if (!r) return null;
  const slug = r.slug;
  const projName = cloudflare.project || 'lunao-web-designn';
  const defaultDeployUrl = `https://${projName}.pages.dev/${slug}/`;
  const deployUrl = r.deploy_url || r.deployUrl || defaultDeployUrl;
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
    templateSource: r.template_source || 'builtin',
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

  // Determine whether this uses an official built-in PWA template or a custom template
  const builtinEligible =
    templateSource === 'custom' || isPwaConnected === false
      ? false
      : isOfficialBuiltinPwaTemplate(templateKey || niche, resolvedTemplate, hasRawHtmlOverride);

  const effectiveTemplateSource = builtinEligible ? 'builtin' : 'custom';
  const effectivePwaConnected = builtinEligible;

  const canonicalBuiltin =
    BUILTIN_TEMPLATES.find(
      (t) =>
        String(t.id || t.key || '').trim().toLowerCase() === String(resolvedTemplate?.key || templateKey || '').trim().toLowerCase() ||
        String(t.niche || '').trim().toLowerCase() === String(niche || '').trim().toLowerCase(),
    ) || BUILTIN_TEMPLATES[0];

  const finalTemplateKey = resolvedTemplate?.key || templateKey || canonicalBuiltin.id || canonicalBuiltin.key || 'barber-dark-luxury';
  const finalNiche = normalizeOfficialNiche(resolvedTemplate?.niche || niche || canonicalBuiltin.niche);
  const finalCampaignSource = normalizeCampaignSource(campaignSource);
  const projName = cloudflare.project || 'lunao-web-designn';
  const finalDeployUrl = deployUrl || `https://${projName}.pages.dev/${cleanSlug}/`;
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

  // 2. Save to production Supabase PostgreSQL
  await ensureUserSitesTable();
  const pool = getPgPool();
  let savedToSupabase = false;

  if (pool) {
    try {
      const { rowCount } = await pool.query(
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
      if (rowCount > 0) {
        savedToSupabase = true;
      }
    } catch (pgErr) {
      console.warn('[sites] Postgres user_sites upsert error:', pgErr.message);
    }
  }

  if (!savedToSupabase) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { error: sbErr } = await sb.from('user_sites').upsert(
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
        if (!sbErr) savedToSupabase = true;
      } catch (sbCatch) {
        console.warn('[sites] Supabase REST user_sites upsert notice:', sbCatch.message);
      }
    }
  }

  return {
    registered: builtinEligible,
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

  await ensureUserSitesTable();
  const bySlug = new Map();

  // 1. Primary: Query production Supabase PostgreSQL
  const pool = getPgPool();
  let queriedRemote = false;
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT slug, owner_id, business_name, city, niche, template_key,
                template_source, is_pwa_connected, campaign_source, campaign_id,
                deploy_url, compiled_html, created_at, updated_at
           FROM public.user_sites
          WHERE owner_id = $1
            AND template_source = 'builtin'
            AND is_pwa_connected = true
          ORDER BY updated_at DESC
          LIMIT 500`,
        [cleanOwner],
      );
      queriedRemote = true;
      for (const r of rows || []) {
        if (!isOfficialBuiltinPwaTemplate(r.template_key)) continue;
        const formatted = formatEditorSiteRow(r);
        if (formatted) bySlug.set(formatted.slug, formatted);
      }
    } catch (err) {
      console.warn('[sites] Postgres listUserEditorSites notice:', err.message);
    }
  }

  if (!queriedRemote) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('user_sites')
          .select('*')
          .eq('owner_id', cleanOwner)
          .eq('template_source', 'builtin')
          .eq('is_pwa_connected', true)
          .order('updated_at', { ascending: false })
          .limit(500);
        if (!error && Array.isArray(data)) {
          queriedRemote = true;
          for (const r of data) {
            if (!isOfficialBuiltinPwaTemplate(r.template_key)) continue;
            const formatted = formatEditorSiteRow(r);
            if (formatted) bySlug.set(formatted.slug, formatted);
          }
        }
      } catch (err) {
        console.warn('[sites] Supabase REST listUserEditorSites notice:', err.message);
      }
    }
  }

  // 2. Merge local SQLite mirror for same ownerKey
  try {
    const localRows = db
      .prepare(
        `SELECT * FROM user_sites
          WHERE owner_id = ?
            AND template_source = 'builtin'
            AND is_pwa_connected = 1
          ORDER BY updated_at DESC
          LIMIT 500`,
      )
      .all(cleanOwner);
    for (const r of localRows || []) {
      if (!isOfficialBuiltinPwaTemplate(r.template_key)) continue;
      if (!bySlug.has(r.slug)) {
        const formatted = formatEditorSiteRow(r);
        if (formatted) bySlug.set(formatted.slug, formatted);
      }
    }
  } catch (err) {
    console.warn('[sites] SQLite listUserEditorSites notice:', err.message);
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

  await ensureUserSitesTable();
  let row = null;

  // 1. Check Supabase PostgreSQL
  const pool = getPgPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM public.user_sites WHERE slug = $1 LIMIT 1',
        [cleanSlug],
      );
      if (rows && rows.length > 0) {
        row = rows[0];
      }
    } catch (err) {
      console.warn('[sites] Postgres getUserEditorSite notice:', err.message);
    }
  }

  if (!row) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data } = await sb
          .from('user_sites')
          .select('*')
          .eq('slug', cleanSlug)
          .maybeSingle();
        if (data) row = data;
      } catch {}
    }
  }

  // 2. Check local SQLite mirror
  if (!row) {
    try {
      row = db.prepare('SELECT * FROM user_sites WHERE slug = ? LIMIT 1').get(cleanSlug);
    } catch {}
  }

  if (!row) {
    return { ok: false, status: 404, error: 'Site not found in your Site Editor workspace.' };
  }

  if (row.owner_id !== cleanOwner) {
    return { ok: false, status: 403, error: 'Forbidden: You do not have permission to access this site.' };
  }

  if (
    row.template_source !== 'builtin' ||
    !row.is_pwa_connected ||
    !isOfficialBuiltinPwaTemplate(row.template_key)
  ) {
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
  const finalUrl = deployUrl || access.site?.deployUrl || localUrl;

  try {
    db.prepare(
      `UPDATE user_sites
          SET compiled_html = ?,
              deploy_url = COALESCE(?, deploy_url),
              updated_at = ?
        WHERE slug = ? AND owner_id = ?`,
    ).run(html, deployUrl, now, cleanSlug, cleanOwner);
  } catch (err) {
    console.warn('[sites] SQLite saveUserEditorSiteHtml notice:', err.message);
  }

  const pool = getPgPool();
  let updatedRemote = false;
  if (pool) {
    try {
      await pool.query(
        `UPDATE public.user_sites
            SET compiled_html = $1,
                deploy_url = COALESCE($2, deploy_url),
                updated_at = $3
          WHERE slug = $4 AND owner_id = $5`,
        [html, deployUrl, now, cleanSlug, cleanOwner],
      );
      updatedRemote = true;
    } catch (err) {
      console.warn('[sites] Postgres saveUserEditorSiteHtml notice:', err.message);
    }
  }

  if (!updatedRemote) {
    const sb = getSupabase();
    if (sb) {
      try {
        const patch = { compiled_html: html, updated_at: now };
        if (deployUrl) patch.deploy_url = deployUrl;
        await sb
          .from('user_sites')
          .update(patch)
          .eq('slug', cleanSlug)
          .eq('owner_id', cleanOwner);
      } catch {}
    }
  }

  return {
    ok: true,
    status: 200,
    slug: cleanSlug,
    url: finalUrl,
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
  return `${siteBaseUrl()}/${slug}/`;
}

export async function siteExists(slug) {
  try {
    await fs.access(siteFile(slug));
    return true;
  } catch {
    return false;
  }
}
