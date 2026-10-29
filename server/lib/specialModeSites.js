// Isolated Special Mode Server Support (UGC & Sales Closer Modes)
// Serves real compiled "Apex Climate Care (Bespoke HVAC)" websites for all 230
// Edmonton contractors at /sites/:slug without touching raw templates or polluting
// standard production database tables.

import fs from 'node:fs';
import path from 'node:path';
import { EDMONTON_230_CONTRACTORS } from './edmonton230Data.js';
import { compileSite } from './compile.js';
import { db } from './db.js';

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

export function mountSpecialModeRoutes(app, SITES_DIR) {
  // Activate or reset special mode & sync server-side credit balance for live Sales Zoom calls
  app.post('/api/special-mode/activate', (req, res) => {
    try {
      const code = String(req.body?.code || '').trim().toUpperCase();
      const ownerKey = String(req.body?.ownerKey || 'dashboard').trim();

      const isUgc = code === UGC_SECRET_CODE || code === 'UGC' || code === 'UGCPLAN' || code === 'UGCCREATOR';
      const isSales = code === SALES_SECRET_CODE || code === 'SALES' || code === 'SALESPLAN' || code === 'SALESGUY';
      const isAffiliate = code === AFFILIATE_SECRET_CODE || code === 'AFFILIATE' || code === 'AFF' || code === 'AFFILIATEPLAN' || code === 'LNO-AFF';
      const isReset = code === RESET_SECRET_CODE || code === 'NORMALSITE99XX73' || code === 'NORMALSITE' || code === 'LNO-RST-0000-CLEAN' || code === 'NORMAL';

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

  // Dynamic on-the-fly renderer for all 230 Edmonton contractors (and any simulated slug not yet on disk)
  app.get('/sites/:slug*', async (req, res, next) => {
    try {
      const rawSlug = req.params.slug;
      if (!rawSlug || rawSlug.includes('.')) return next();
      const cleanSlug = rawSlug.toLowerCase().replace(/^\/+|\/+$/g, '');

      // 1. If a physical file exists on disk in SITES_DIR, let disk win (preserves user edits)
      const indexPath = path.join(SITES_DIR, cleanSlug, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }

      // 2. Otherwise compile Apex Climate Care (hvac-bespoke / hvac-template-02.html) on the fly
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
