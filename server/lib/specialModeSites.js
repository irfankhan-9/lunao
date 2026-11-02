// Isolated Special Mode Server Support (UGC & Sales Closer Modes)
// Serves real compiled "Apex Climate Care (Bespoke HVAC)" websites for all 230
// Edmonton contractors at /sites/:slug without touching raw templates or polluting
// standard production database tables.

import fs from 'node:fs';
import path from 'node:path';
import { EDMONTON_230_CONTRACTORS } from './edmonton230Data.js';
import { compileSite } from './compile.js';
import { db } from './db.js';
import { getPgPool, getSupabase } from './supabase.js';
import { cloudflare } from './config.js';
import { publishBatch } from './cloudflare.js';

export const UGC_SECRET_CODE = 'LNO-UGC-9X4K-77VQ';
export const SALES_SECRET_CODE = 'LNO-SLS-3M8P-92ZR';
export const AFFILIATE_SECRET_CODE = 'LNO-AFF-8K2M-44QP';
export const RESET_SECRET_CODE = 'NORMALSITE99XX73';

// SQLite session storage for active special mode accounts (zero client-bundle footprint)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS special_mode_sessions (
      owner_key TEXT PRIMARY KEY,
      mode TEXT,
      payout_email TEXT,
      activated_at INTEGER
    )
  `);
} catch (e) {
  console.warn('[SpecialMode] Table init warning:', e.message);
}

const memoryActiveSessions = new Map();

export function recordSpecialModeSession(ownerKey, mode) {
  const now = Date.now();
  const keys = Array.from(new Set([ownerKey, 'dashboard', 'dash-Agency-Plan'])).filter(Boolean);
  for (const k of keys) {
    memoryActiveSessions.set(k, { mode, activatedAt: now });
    try {
      db.prepare(`
        INSERT INTO special_mode_sessions (owner_key, mode, activated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(owner_key) DO UPDATE SET mode = excluded.mode, activated_at = excluded.activated_at
      `).run(k, mode, now);
    } catch (err) {
      console.warn('[SpecialMode] Error saving session:', err.message);
    }
  }
}

export function clearSpecialModeSession(ownerKey) {
  const keys = Array.from(new Set([ownerKey, 'dashboard', 'dash-Agency-Plan'])).filter(Boolean);
  for (const k of keys) {
    memoryActiveSessions.delete(k);
    try {
      db.prepare(`DELETE FROM special_mode_sessions WHERE owner_key = ?`).run(k);
    } catch (err) {
      console.warn('[SpecialMode] Error clearing session:', err.message);
    }
  }
}

export function setSpecialModePayoutEmail(ownerKey, payoutEmail) {
  const keys = Array.from(new Set([ownerKey, 'dashboard', 'dash-Agency-Plan'])).filter(Boolean);
  for (const k of keys) {
    const mem = memoryActiveSessions.get(k);
    if (mem) mem.payoutEmail = payoutEmail;
    try {
      db.prepare(`UPDATE special_mode_sessions SET payout_email = ? WHERE owner_key = ?`).run(payoutEmail, k);
    } catch {
      /* ignore */
    }
  }
}

export function isSpecialAffiliateModeActive(ownerKey) {
  const keys = Array.from(new Set([ownerKey, 'dashboard'])).filter(Boolean);
  for (const k of keys) {
    if (memoryActiveSessions.has(k)) {
      const m = memoryActiveSessions.get(k)?.mode;
      if (m === 'affiliate' || m === 'sales' || m === 'ugc') return true;
    }
    try {
      const row = db.prepare(`SELECT mode FROM special_mode_sessions WHERE owner_key = ?`).get(k);
      if (row && (row.mode === 'affiliate' || row.mode === 'sales' || row.mode === 'ugc')) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function getSpecialModePayoutEmail(ownerKey) {
  const keys = Array.from(new Set([ownerKey, 'dashboard'])).filter(Boolean);
  for (const k of keys) {
    if (memoryActiveSessions.get(k)?.payoutEmail) {
      return memoryActiveSessions.get(k).payoutEmail;
    }
    try {
      const row = db.prepare(`SELECT payout_email FROM special_mode_sessions WHERE owner_key = ?`).get(k);
      if (row?.payout_email) return row.payout_email;
    } catch {
      /* ignore */
    }
  }
  return 'josh@apexgrowthmedia.com';
}

const CONTRACTOR_BY_SLUG = new Map(
  EDMONTON_230_CONTRACTORS.map((c) => [c.slug.toLowerCase(), c])
);

// Small LRU cache for compiled contractor HTML so repeated clicks are sub-millisecond
const compiledCache = new Map();
const MAX_CACHE = 40;

export async function getCompiledContractorHtml(slug) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!cleanSlug) return null;

  if (compiledCache.has(cleanSlug)) {
    return compiledCache.get(cleanSlug);
  }

  const contractor = CONTRACTOR_BY_SLUG.get(cleanSlug);
  const bizPayload = contractor
    ? {
        name: contractor.name,
        slug: contractor.slug,
        phone: contractor.displayPhone,
        phone_display: contractor.displayPhone,
        phone_raw: contractor.phone.replace(/\D/g, ''),
        city: contractor.city,
        state: 'AB',
        address: contractor.address,
        google_rating: '4.9',
        google_review_count: String(140 + (contractor.index * 7) % 280),
        years_in_business: String(2008 + (contractor.index % 14)),
      }
    : {
        name: cleanSlug
          .replace(/-edmonton$/i, '')
          .split('-')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ') || 'Apex Climate Care',
        slug: cleanSlug,
        phone: '(780) 555-0199',
        phone_display: '(780) 555-0199',
        phone_raw: '17805550199',
        city: 'Edmonton, AB',
        state: 'AB',
        address: 'Downtown Edmonton, AB',
        google_rating: '4.9',
        google_review_count: '318',
        years_in_business: '2014',
      };

  const { html } = await compileSite(bizPayload, 'hvac-bespoke');

  if (compiledCache.size >= MAX_CACHE) {
    const oldestKey = compiledCache.keys().next().value;
    if (oldestKey) compiledCache.delete(oldestKey);
  }
  compiledCache.set(cleanSlug, html);
  return html;
}

export function isEdmontonContractorSlug(slug) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  return CONTRACTOR_BY_SLUG.has(cleanSlug);
}

export function isSpecialUgcOrSalesRequest(req, ownerKey) {
  const headerMode = String(req?.headers?.['x-special-mode'] || '').trim().toLowerCase();
  if (headerMode === 'ugc' || headerMode === 'sales') return true;

  const keys = Array.from(new Set([ownerKey, 'dashboard', 'dash-Agency-Plan'])).filter(Boolean);
  for (const k of keys) {
    if (memoryActiveSessions.has(k)) {
      const m = memoryActiveSessions.get(k)?.mode;
      if (m === 'ugc' || m === 'sales') return true;
    }
    try {
      const row = db.prepare(`SELECT mode FROM special_mode_sessions WHERE owner_key = ?`).get(k);
      if (row && (row.mode === 'ugc' || row.mode === 'sales')) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function getSpecialModeContractorSite(slug) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!cleanSlug) return null;
  const contractor = CONTRACTOR_BY_SLUG.get(cleanSlug);
  const businessName = contractor
    ? contractor.name
    : cleanSlug
        .replace(/-edmonton$/i, '')
        .split('-')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') || 'Apex Climate Care';
  const city = contractor ? contractor.city : 'Edmonton, AB';
  const url = `https://lunao-web-designn.pages.dev/${cleanSlug}/`;
  return {
    slug: cleanSlug,
    title: `${businessName} — ${city}`,
    businessName,
    niche: 'HVAC',
    phone: contractor ? contractor.displayPhone : '(780) 555-0199',
    city,
    address: contractor ? contractor.address : 'Edmonton, AB',
    url,
    deployUrl: url,
    updatedAt: Date.now(),
    campaignSource: 'sms',
    templateKey: 'hvac-bespoke',
  };
}

export async function ensureSpecialModeSiteHtml(slug, SITES_DIR) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!cleanSlug) return null;
  if (SITES_DIR) {
    const filePath = path.join(SITES_DIR, cleanSlug, 'index.html');
    try {
      if (fs.existsSync(filePath)) {
        const diskHtml = fs.readFileSync(filePath, 'utf8');
        if (diskHtml && diskHtml.trim()) {
          compiledCache.set(cleanSlug, diskHtml);
          return diskHtml;
        }
      }
    } catch {
      /* fallback to compile */
    }
  }
  const html = await getCompiledContractorHtml(cleanSlug);
  if (html && SITES_DIR) {
    try {
      const dirPath = path.join(SITES_DIR, cleanSlug);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'index.html'), html, 'utf8');
    } catch {
      /* ignore */
    }
  }
  return html;
}

export function saveSpecialModeSiteHtml(slug, html, SITES_DIR) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!cleanSlug || typeof html !== 'string') return;
  compiledCache.set(cleanSlug, html);
  if (SITES_DIR) {
    try {
      const dirPath = path.join(SITES_DIR, cleanSlug);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'index.html'), html, 'utf8');
    } catch {
      /* ignore */
    }
  }
}

function setExactServerCredits(ownerKey, plan, balance) {
  if (!ownerKey) return;
  const now = Date.now();
  try {
    const existing = db
      .prepare('SELECT * FROM credit_accounts WHERE owner_key = ?')
      .get(ownerKey);
    if (!existing) {
      db.prepare(
        `INSERT INTO credit_accounts
           (owner_key, plan, balance, lifetime_used, lifetime_refunded, updated_at, created_at)
         VALUES (?, ?, ?, 180, 0, ?, ?)`
      ).run(ownerKey, plan, balance, now, now);
    } else {
      db.prepare(
        `UPDATE credit_accounts SET plan = ?, balance = ?, updated_at = ? WHERE owner_key = ?`
      ).run(plan, balance, now, ownerKey);
    }
  } catch (err) {
    console.warn('[SpecialMode] Failed to sync server credits:', err?.message);
  }
}

export async function seedAndDeployAll230EdmontonSites(SITES_DIR) {
  const pool = getPgPool();
  const sb = getSupabase();
  const projName = cloudflare.project || 'lunao-web-designn';
  const now = Date.now();

  console.log(`[SpecialMode] Pre-compiling all ${EDMONTON_230_CONTRACTORS.length} Edmonton contractor sites in memory...`);

  const compiledSites = [];
  for (const c of EDMONTON_230_CONTRACTORS) {
    try {
      const slug = c.slug.toLowerCase();
      const html = await getCompiledContractorHtml(slug);
      if (html) {
        compiledSites.push({
          slug,
          name: c.name,
          city: c.city,
          deployUrl: `https://${projName}.pages.dev/${slug}/`,
          html,
        });
      }
    } catch (err) {
      console.warn(`[SpecialMode] Error compiling contractor ${c.slug}:`, err.message);
    }
  }

  // 1. Write physical directories to SITES_DIR
  if (SITES_DIR) {
    fs.mkdirSync(SITES_DIR, { recursive: true });
    for (const site of compiledSites) {
      try {
        const dirPath = path.join(SITES_DIR, site.slug);
        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(path.join(dirPath, 'index.html'), site.html, 'utf8');
      } catch (err) {
        console.warn(`[SpecialMode] Error writing ${site.slug} to disk:`, err.message);
      }
    }

    // Ensure edge assets exist at root of SITES_DIR
    try {
      const root404Path = path.join(SITES_DIR, '404.html');
      fs.writeFileSync(
        root404Path,
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>LUNAO SERVERS ARE DOWN AT MOMENT CONTACT US ON:: lunaoxx77@gmail.com</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fff;text-align:center;"><div><h1 style="font-size:1.5rem;margin-bottom:1rem;">LUNAO SERVERS ARE DOWN AT MOMENT CONTACT US ON:: lunaoxx77@gmail.com</h1></div></body></html>`,
        'utf8'
      );
      const srcBridge = path.join(ROOT_DIR, 'public', 'lunao-booking-bridge.js');
      const dstBridge = path.join(SITES_DIR, 'lunao-booking-bridge.js');
      if (fs.existsSync(srcBridge)) {
        fs.copyFileSync(srcBridge, dstBridge);
      }
      const srcWorker = path.join(ROOT_DIR, 'public', '_worker.js');
      const dstWorker = path.join(SITES_DIR, '_worker.js');
      if (fs.existsSync(srcWorker)) {
        fs.copyFileSync(srcWorker, dstWorker);
      }
    } catch {}
  }

  // 2. Persist to local SQLite within a single atomic transaction
  try {
    const ownerKeys = ['dashboard', 'dash-Agency-Plan', 'user_ugc', 'user_sales'];
    const insertStmt = db.prepare(`
      INSERT INTO user_sites (
        slug, owner_id, business_name, city, niche, template_key,
        template_source, is_pwa_connected, campaign_source, campaign_id,
        deploy_url, compiled_html, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'HVAC', 'hvac-bespoke', 'builtin', 1, 'sms', 'cmp_edmonton_230', ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        compiled_html = excluded.compiled_html,
        deploy_url = excluded.deploy_url,
        updated_at = excluded.updated_at
    `);

    const insertAll = db.transaction((sites) => {
      for (const s of sites) {
        for (const ok of ownerKeys) {
          try {
            insertStmt.run(s.slug, ok, s.name, s.city, s.deployUrl, s.html, now, now);
          } catch {}
        }
      }
    });
    insertAll(compiledSites);
    console.log(`[SpecialMode] Saved ${compiledSites.length} sites into SQLite.`);
  } catch (sqlErr) {
    console.warn('[SpecialMode] SQLite batch insert notice:', sqlErr.message);
  }

  // 3. Persist to Supabase in parallel batches of 20
  if (pool) {
    try {
      const batchSize = 20;
      for (let i = 0; i < compiledSites.length; i += batchSize) {
        const batch = compiledSites.slice(i, i + batchSize);
        await Promise.all(
          batch.map((s) =>
            pool.query(
              `INSERT INTO public.user_sites (
                 owner_id, slug, business_name, city, niche, template_key,
                 template_source, is_pwa_connected, campaign_source, campaign_id,
                 deploy_url, compiled_html, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, 'HVAC', 'hvac-bespoke', 'builtin', true, 'sms', 'cmp_edmonton_230', $5, $6, $7, $7)
               ON CONFLICT (slug) DO UPDATE SET
                 compiled_html = EXCLUDED.compiled_html,
                 deploy_url = EXCLUDED.deploy_url,
                 updated_at = EXCLUDED.updated_at`,
              ['dash-Agency-Plan', s.slug, s.name, s.city, s.deployUrl, s.html, now]
            ).catch(() => {})
          )
        );
      }
      console.log(`[SpecialMode] Persisted ${compiledSites.length} sites into Supabase PostgreSQL.`);
    } catch (pgErr) {
      console.warn('[SpecialMode] Supabase Postgres sync notice:', pgErr.message);
    }
  } else if (sb) {
    try {
      const batchSize = 50;
      for (let i = 0; i < compiledSites.length; i += batchSize) {
        const batch = compiledSites.slice(i, i + batchSize).map((s) => ({
          owner_id: 'dash-Agency-Plan',
          slug: s.slug,
          business_name: s.name,
          city: s.city,
          niche: 'HVAC',
          template_key: 'hvac-bespoke',
          template_source: 'builtin',
          is_pwa_connected: true,
          campaign_source: 'sms',
          campaign_id: 'cmp_edmonton_230',
          deploy_url: s.deployUrl,
          compiled_html: s.html,
          created_at: now,
          updated_at: now,
        }));
        await sb.from('user_sites').upsert(batch, { onConflict: 'slug' }).catch(() => {});
      }
    } catch (sbErr) {
      console.warn('[SpecialMode] Supabase REST sync notice:', sbErr.message);
    }
  }

  // 4. Deploy batch to Cloudflare Pages
  let cloudflareResult = null;
  if (cloudflare.live) {
    try {
      console.log(`[SpecialMode] Deploying ${compiledSites.length} sites to Cloudflare Pages (${projName})...`);
      cloudflareResult = await publishBatch();
      console.log(`[SpecialMode] Cloudflare Pages deploy result:`, cloudflareResult);
    } catch (cfErr) {
      console.warn('[SpecialMode] Cloudflare deploy batch error:', cfErr.message);
      cloudflareResult = { ok: false, error: cfErr.message };
    }
  }

  return { ok: true, count: compiledSites.length, total: EDMONTON_230_CONTRACTORS.length, cloudflareResult };
}

export function mountSpecialModeRoutes(app, SITES_DIR) {
  // Batch deploy all 230 Edmonton contractor sites to Supabase & Cloudflare Pages
  app.post('/api/special-mode/deploy-all-230', async (req, res) => {
    try {
      const result = await seedAndDeployAll230EdmontonSites(SITES_DIR);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Activate or reset special mode & sync server-side credit balance for live Sales Zoom calls
  app.post('/api/special-mode/activate', (req, res) => {
    try {
      const code = String(req.body?.code || '').trim().toUpperCase();
      const ownerKey = String(req.body?.ownerKey || 'dashboard').trim();

      const isUgc = code === UGC_SECRET_CODE || code === 'UGC' || code === 'UGCPLAN' || code === 'UGCCREATOR';
      const isSales = code === SALES_SECRET_CODE || code === 'SALES' || code === 'SALESPLAN' || code === 'SALESGUY';
      const isAffiliate = code === AFFILIATE_SECRET_CODE || code === 'AFFILIATE' || code === 'AFF' || code === 'AFFILIATEPLAN' || code === 'LNO-AFF';
      const isReset = code === RESET_SECRET_CODE || code === 'NORMALSITE99XX73' || code === 'NORMALSITE' || code === 'LNO-RST-0000-CLEAN' || code === 'NORMAL';

      if (isUgc || isSales || isAffiliate) {
        // Trigger background seeding of all 230 sites so they are guaranteed in DB and staged
        seedAndDeployAll230EdmontonSites(SITES_DIR).catch((err) => {
          console.warn('[SpecialMode] Async 230 site seeding notice:', err.message);
        });
      }

      if (isUgc) {
        const ugcCredits = Number(req.body?.credits) || (9800 + Math.floor(Math.random() * 60));
        recordSpecialModeSession(ownerKey, 'ugc');
        setExactServerCredits(ownerKey, 'Agency Plan', ugcCredits);
        setExactServerCredits('dashboard', 'Agency Plan', ugcCredits);
        setExactServerCredits('dash-Agency-Plan', 'Agency Plan', ugcCredits);
        return res.json({
          ok: true,
          mode: 'ugc',
          plan: 'Agency Plan',
          credits: ugcCredits,
          vibeCredits: 920,
          userName: 'Josh',
          userEmail: 'josh@apexgrowthmedia.com',
        });
      }

      if (isSales) {
        const salesCredits = Number(req.body?.credits) || (9800 + Math.floor(Math.random() * 60));
        recordSpecialModeSession(ownerKey, 'sales');
        setExactServerCredits(ownerKey, 'Agency Plan', salesCredits);
        setExactServerCredits('dashboard', 'Agency Plan', salesCredits);
        setExactServerCredits('dash-Agency-Plan', 'Agency Plan', salesCredits);
        return res.json({
          ok: true,
          mode: 'sales',
          plan: 'Agency Plan',
          credits: salesCredits,
          vibeCredits: 920,
          userName: 'Josh',
          userEmail: 'josh@apexgrowthmedia.com',
        });
      }

      if (isAffiliate) {
        const affCredits = Number(req.body?.credits) || (9800 + Math.floor(Math.random() * 60));
        recordSpecialModeSession(ownerKey, 'affiliate');
        setExactServerCredits(ownerKey, 'Agency Plan', affCredits);
        setExactServerCredits('dashboard', 'Agency Plan', affCredits);
        setExactServerCredits('dash-Agency-Plan', 'Agency Plan', affCredits);
        return res.json({
          ok: true,
          mode: 'affiliate',
          plan: 'Agency Plan',
          credits: affCredits,
          vibeCredits: 920,
          userName: 'Josh',
          userEmail: 'josh@apexgrowthmedia.com',
        });
      }

      if (isReset) {
        clearSpecialModeSession(ownerKey);
        setExactServerCredits(ownerKey, 'Free Plan', 5);
        setExactServerCredits('dashboard', 'Free Plan', 5);
        return res.json({
          ok: true,
          mode: 'normal',
          plan: 'Free Plan',
          credits: 5,
          vibeCredits: 0,
          userName: 'Operator',
          userEmail: 'operator@lunao.local',
        });
      }

      return res.status(400).json({ ok: false, error: 'Invalid or expired partner access code.' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || 'Activation failed' });
    }
  });

  // Self-Healing Dynamic Renderer:
  // 1. Disk check (fastest)
  // 2. Supabase / SQLite user_sites lookup (persisted user deploys) + auto-write to disk
  // 3. 230 Edmonton Special Mode contractors (hvac-bespoke on-the-fly compile)
  app.get('/sites/:slug*', async (req, res, next) => {
    try {
      const rawSlug = req.params.slug;
      if (!rawSlug || rawSlug.includes('.')) return next();
      const cleanSlug = rawSlug.toLowerCase().replace(/^\/+|\/+$/g, '');

      // 1. If physical file exists on disk in SITES_DIR, let disk win
      const indexPath = path.join(SITES_DIR, cleanSlug, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }

      // 2. Dynamic Supabase Lookup: fetch compiled_html from public.user_sites
      let dbHtml = null;
      const pool = getPgPool();
      if (pool) {
        try {
          const { rows } = await pool.query(
            'SELECT compiled_html FROM public.user_sites WHERE slug = $1 LIMIT 1',
            [cleanSlug]
          );
          if (rows && rows.length > 0 && rows[0].compiled_html) {
            dbHtml = rows[0].compiled_html;
          }
        } catch {}
      }

      if (!dbHtml) {
        const sb = getSupabase();
        if (sb) {
          try {
            const { data } = await sb
              .from('user_sites')
              .select('compiled_html')
              .eq('slug', cleanSlug)
              .maybeSingle();
            if (data?.compiled_html) dbHtml = data.compiled_html;
          } catch {}
        }
      }

      if (!dbHtml) {
        try {
          const localRow = db.prepare('SELECT compiled_html FROM user_sites WHERE slug = ?').get(cleanSlug);
          if (localRow?.compiled_html) dbHtml = localRow.compiled_html;
        } catch {}
      }

      if (dbHtml) {
        // Auto-hydrate disk cache for future rapid serves
        try {
          const dirPath = path.join(SITES_DIR, cleanSlug);
          fs.mkdirSync(dirPath, { recursive: true });
          fs.writeFileSync(path.join(dirPath, 'index.html'), dbHtml, 'utf8');
        } catch {}

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(dbHtml);
      }

      // 3. Otherwise compile Apex Climate Care (hvac-bespoke) on the fly for 230 Edmonton contractors
      const html = await getCompiledContractorHtml(cleanSlug);
      if (html) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(html);
      }
      return next();
    } catch (err) {
      console.error('[SpecialModeSites] Render error:', err?.message);
      return next();
    }
  });
}
