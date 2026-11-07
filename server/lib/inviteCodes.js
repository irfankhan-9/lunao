// Per-site invite codes for the Lunao Owner App.
//
// Each code is LUNAO-XXXX-XXXX (8 chars in 2 groups of 4) and is bound to
// exactly one slug at creation time. The agency's dashboard uses these
// to hand a business owner access to their mobile companion without
// revealing any other site's data.
//
// The generator excludes 0/O/1/I/L so codes are easy to read aloud and
// type on a phone.
import crypto from 'node:crypto';
import { db } from './db.js';

// Human-friendly alphabet — no 0/O, no 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALPHABET_LEN = ALPHABET.length;
const CODE_RE = /^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function randomSegment(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET_LEN];
  }
  return out;
}

function codeExists(code) {
  return Boolean(
    db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code),
  );
}

// Try up to 5 times to mint a unique code. With 31^8 ≈ 8.5e11 possible
// codes the chance of any collision is essentially zero even at scale,
// but we loop defensively in case of degenerate randomness.
export function generateCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `LUNAO-${randomSegment(4)}-${randomSegment(4)}`;
    if (!codeExists(code)) return code;
  }
  throw new Error('Could not generate a unique invite code. Try again.');
}

export function isValidCodeFormat(code) {
  return typeof code === 'string' && CODE_RE.test(code.trim());
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    label: row.label,
    createdAt: row.created_at,
    usedAt: row.used_at,
    lastActiveAt: row.last_active_at,
    revokedAt: row.revoked_at,
    redeemedCount: row.redeemed_count,
  };
}

function rowToSafeRecord(row) {
  if (!row) return null;
  // Safe shape: never leaks the slug. Used by GET /api/invite-codes/:code.
  return {
    code: row.code,
    label: row.label,
    createdAt: row.created_at,
    usedAt: row.used_at,
    lastActiveAt: row.last_active_at,
    revokedAt: row.revoked_at,
  };
}

export function listCodes(slug) {
  const rows = db
    .prepare('SELECT * FROM invite_codes WHERE slug = ? ORDER BY created_at DESC')
    .all(slug);
  return rows.map(rowToRecord);
}

export async function listCodesAsync(slug) {
  if (!slug) return [];
  const cleanSlug = String(slug).trim().toLowerCase();
  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from('invite_codes')
        .select('*')
        .eq('slug', cleanSlug)
        .order('created_at', { ascending: false });
      if (Array.isArray(data) && data.length > 0) {
        for (const d of data) {
          try {
            db.prepare(
              `INSERT INTO invite_codes (code, slug, label, created_at, used_at, last_active_at, redeemed_count, revoked_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(code) DO UPDATE SET
                 slug=excluded.slug,
                 used_at=COALESCE(excluded.used_at, invite_codes.used_at),
                 last_active_at=COALESCE(excluded.last_active_at, invite_codes.last_active_at),
                 redeemed_count=COALESCE(excluded.redeemed_count, invite_codes.redeemed_count),
                 revoked_at=excluded.revoked_at`
            ).run(
              d.code,
              d.slug,
              d.label || null,
              d.created_at || Date.now(),
              d.used_at || null,
              d.last_active_at || null,
              d.redeemed_count || 0,
              d.revoked_at || null
            );
          } catch {}
        }
      }
    }
  } catch {}
  return listCodes(cleanSlug);
}

export async function persistInviteCodeToSupabase(rec) {
  if (!rec || !rec.code || !rec.slug) return;
  const payload = {
    code: rec.code,
    slug: rec.slug,
    label: rec.label || null,
    created_at: rec.createdAt || Date.now(),
    used_at: rec.usedAt || null,
    last_active_at: rec.lastActiveAt || null,
    redeemed_count: rec.redeemedCount || 0,
    revoked_at: rec.revokedAt || null,
  };

  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from('invite_codes').upsert(payload, { onConflict: 'code' });
      if (!error) return;
    }
  } catch {}

  // REST API fallback
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
    const SUPABASE_KEY =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof atob === 'function' ? atob('c2Jfc2VjcmV0X1lJREpNaG1JSTlyaTJ2Q2JaSWdHUmdfSWFMNXhLd2Y=') : '');
    await fetch(`${SUPABASE_URL}/rest/v1/invite_codes`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
  } catch {}
}

export function createCode(slug, label, forcedCode = null) {
  const code = forcedCode && isValidCodeFormat(forcedCode) ? forcedCode.toUpperCase() : generateCode();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO invite_codes (code, slug, label, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET slug=excluded.slug, label=COALESCE(excluded.label, invite_codes.label)`,
    )
    .run(code, slug, label || null, now);
  const rec = findByCode(code);
  persistInviteCodeToSupabase(rec).catch(() => {});
  return rec;
}

export function findById(id) {
  const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id);
  return rowToRecord(row);
}

export function findByCode(code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM invite_codes WHERE code = ?')
    .get(normalized);
  return rowToRecord(row);
}

export async function findByCodeAsync(code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM invite_codes WHERE code = ?')
    .get(normalized);
  if (row) return rowToRecord(row);

  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from('invite_codes')
        .select('*')
        .eq('code', normalized)
        .maybeSingle();
      if (data) {
        try {
          db.prepare(
            `INSERT INTO invite_codes (code, slug, label, created_at, used_at, last_active_at, redeemed_count, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(code) DO UPDATE SET slug=excluded.slug, revoked_at=excluded.revoked_at`
          ).run(
            data.code,
            data.slug,
            data.label || null,
            data.created_at || Date.now(),
            data.used_at || null,
            data.last_active_at || null,
            data.redeemed_count || 0,
            data.revoked_at || null
          );
        } catch {}
        return rowToRecord(data);
      }
    }
  } catch {}
  return null;
}

export function findByCodeSafe(code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM invite_codes WHERE code = ?')
    .get(normalized);
  return rowToSafeRecord(row);
}

export function revokeCode(id) {
  const now = Date.now();
  const info = db
    .prepare(
      `UPDATE invite_codes
         SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ?`,
    )
    .run(now, id);
  if (!info.changes) return null;
  const updated = findById(id);
  if (updated) {
    persistInviteCodeToSupabase(updated).catch(() => {});
  }
  return updated;
}

export function renameCode(id, label) {
  const info = db
    .prepare('UPDATE invite_codes SET label = ? WHERE id = ?')
    .run(label || null, id);
  if (!info.changes) return null;
  return findById(id);
}

// Called on every successful /api/owner/redeem to record usage.
export function touchCode(code, _deviceLabel) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const now = Date.now();
  db.prepare(
    `UPDATE invite_codes
       SET used_at = COALESCE(used_at, ?),
           last_active_at = ?,
           redeemed_count = redeemed_count + 1
     WHERE code = ?`,
  ).run(now, now, normalized);

  // Sync to Supabase in background if configured
  import('./supabase.js').then(({ getPgPool, getSupabase }) => {
    const pool = getPgPool();
    if (pool) {
      pool.query(
        `UPDATE invite_codes
            SET used_at = COALESCE(used_at, $1),
                last_active_at = $1,
                redeemed_count = COALESCE(redeemed_count, 0) + 1
          WHERE UPPER(code) = UPPER($2)`,
        [now, normalized]
      ).catch(() => {});
    } else {
      const sb = getSupabase();
      if (sb) {
        sb.from('invite_codes')
          .update({ used_at: now, last_active_at: now })
          .eq('code', normalized)
          .then(() => {})
          .catch(() => {});
      }
    }
  }).catch(() => {});

  return findByCode(normalized);
}

// Synchronous check if PWA is active for a slug in local SQLite
export function isPwaActiveForSlug(slug) {
  if (!slug) return false;
  try {
    const cleanSlug = String(slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    // Strictly verify if any non-revoked invite code has been generated for this exact slug
    const rows = db.prepare('SELECT slug, revoked_at FROM invite_codes WHERE revoked_at IS NULL').all();
    if (!Array.isArray(rows)) return false;
    return rows.some(
      (r) =>
        r &&
        String(r.slug || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '') === cleanSlug &&
        (r.revoked_at === null || r.revoked_at === undefined)
    );
  } catch {
    return false;
  }
}

// Authoritative async check across local DB, Postgres pool, and Supabase client
export async function isPwaActiveForSlugAsync(slug) {
  if (!slug) return false;
  const cleanSlug = String(slug).trim().toLowerCase().replace(/^\/+|\/+$/g, '');

  // 1. Check local DB (instant)
  if (isPwaActiveForSlug(cleanSlug)) {
    return true;
  }

  // 2. Check Postgres pool (direct connection to Supabase DB)
  try {
    const { getPgPool } = await import('./supabase.js');
    const pool = getPgPool();
    if (pool) {
      // Check if any non-revoked invite code has been generated for this slug
      const { rows: codeRows } = await pool.query(
        'SELECT 1 FROM invite_codes WHERE LOWER(slug) = $1 AND revoked_at IS NULL LIMIT 1',
        [cleanSlug]
      );
      if (codeRows && codeRows.length > 0) {
        try {
          db.prepare('INSERT OR IGNORE INTO invite_codes (code, slug, created_at) VALUES (?, ?, ?)').run(
            `SYNC-${cleanSlug.slice(0, 8)}`,
            cleanSlug,
            Date.now()
          );
        } catch (_) {}
        return true;
      }
      return false;
    }
  } catch (_) {}

  // 3. Check Supabase REST / SDK client
  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      // Check if any non-revoked invite code has been generated for this slug
      const { data: codeData } = await sb
        .from('invite_codes')
        .select('code, revoked_at')
        .eq('slug', cleanSlug)
        .is('revoked_at', null)
        .limit(1);
      if (codeData && codeData.length > 0) {
        try {
          db.prepare('INSERT OR IGNORE INTO invite_codes (code, slug, created_at) VALUES (?, ?, ?)').run(
            `SYNC-${cleanSlug.slice(0, 8)}`,
            cleanSlug,
            Date.now()
          );
        } catch (_) {}
        return true;
      }
      return false;
    }
  } catch (_) {}

  return false;
}

// Get or create an invite code for a slug
export function getOrCreateCodeForSlug(slug, label = 'Owner PWA Access') {
  if (!slug) return null;
  const existing = listCodes(slug).find((c) => !c.revokedAt);
  if (existing) {
    return existing;
  }
  return createCode(slug, label);
}

// Authoritative async get or create across local DB and Supabase
export async function getOrCreateCodeForSlugAsync(slug, preferredCode = null, label = 'Owner PWA Access') {
  if (!slug) return null;
  const cleanSlug = String(slug).trim().toLowerCase();

  // 1. Check local DB
  const existingLocal = db.prepare(
    'SELECT * FROM invite_codes WHERE LOWER(slug) = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1'
  ).get(cleanSlug);
  if (existingLocal) return rowToRecord(existingLocal);

  // 2. Check Supabase
  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from('invite_codes')
        .select('*')
        .eq('slug', cleanSlug)
        .is('revoked_at', null)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        db.prepare(
          `INSERT INTO invite_codes (code, slug, label, created_at, used_at, last_active_at, redeemed_count, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET slug=excluded.slug, revoked_at=excluded.revoked_at`
        ).run(
          data.code,
          data.slug,
          data.label || null,
          data.created_at || Date.now(),
          data.used_at || null,
          data.last_active_at || null,
          data.redeemed_count || 0,
          data.revoked_at || null
        );
        return rowToRecord(data);
      }
    }
  } catch {}

  // 3. Verify that the slug is a legitimate deployed website before auto-provisioning
  let isValid = false;
  try {
    const row = db.prepare('SELECT 1 FROM user_sites WHERE LOWER(slug) = ?').get(cleanSlug);
    if (row) isValid = true;
  } catch {}

  if (!isValid) {
    try {
      const { getSupabase } = await import('./supabase.js');
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.from('user_sites').select('id').eq('slug', cleanSlug).limit(1);
        if (data && data.length > 0) isValid = true;
      }
    } catch {}
  }

  if (!isValid) {
    return null;
  }

  // 4. Create code for the valid slug
  const codeToUse = (preferredCode && isValidCodeFormat(preferredCode)) ? preferredCode : null;
  return createCode(cleanSlug, label, codeToUse);
}

// Resolve the ownerKey (agency user ID) who owns a given website slug
export async function getOwnerKeyForSlugAsync(slug) {
  if (!slug) return null;
  const cleanSlug = String(slug).trim().toLowerCase();

  try {
    const siteRow = db.prepare('SELECT owner_id FROM user_sites WHERE LOWER(slug) = ?').get(cleanSlug);
    if (siteRow && siteRow.owner_id) return String(siteRow.owner_id);
  } catch {}

  try {
    const bpRow = db.prepare('SELECT owner_key FROM business_profiles WHERE LOWER(slug) = ?').get(cleanSlug);
    if (bpRow && bpRow.owner_key && bpRow.owner_key !== 'default_owner') return String(bpRow.owner_key);
  } catch {}

  try {
    const obRow = db.prepare('SELECT owner_key FROM owner_businesses WHERE LOWER(slug) = ?').get(cleanSlug);
    if (obRow && obRow.owner_key) return String(obRow.owner_key);
  } catch {}

  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from('user_sites')
        .select('owner_id')
        .eq('slug', cleanSlug)
        .maybeSingle();
      if (data && data.owner_id) return String(data.owner_id);
    }
  } catch {}

  return null;
}

// Calculate authoritative PWA activation quota & active count for an ownerKey across SQLite + Supabase
export async function getOwnerPwaQuotaStatusAsync(ownerKey, fallbackPlan = null) {
  const { normalisePlan, pwaAllowanceForPlan } = await import('./planGates.js');
  const cleanOwner = String(ownerKey || '').trim();

  // 1. Resolve user's plan from credit_accounts (local or Supabase) or fallbackPlan
  let resolvedPlan = fallbackPlan ? normalisePlan(fallbackPlan) : null;
  if (cleanOwner) {
    try {
      const acct = db.prepare('SELECT plan FROM credit_accounts WHERE owner_key = ?').get(cleanOwner);
      if (acct && acct.plan) {
        resolvedPlan = normalisePlan(acct.plan);
      }
    } catch {}
    if (!resolvedPlan) {
      try {
        const { getSupabase } = await import('./supabase.js');
        const sb = getSupabase();
        if (sb) {
          const { data } = await sb
            .from('credit_accounts')
            .select('plan')
            .eq('owner_key', cleanOwner)
            .maybeSingle();
          if (data && data.plan) resolvedPlan = normalisePlan(data.plan);
        }
      } catch {}
    }
  }
  const finalPlan = normalisePlan(resolvedPlan || fallbackPlan || 'Free Plan');
  const maxAllowed = pwaAllowanceForPlan(finalPlan);

  // 2. Collect all website slugs belonging to this ownerKey
  const ownerSlugs = new Set();
  if (cleanOwner) {
    try {
      const rows = db.prepare('SELECT slug FROM user_sites WHERE owner_id = ?').all(cleanOwner);
      for (const r of rows || []) {
        if (r && r.slug) ownerSlugs.add(String(r.slug).toLowerCase());
      }
    } catch {}
    try {
      const rows = db.prepare('SELECT slug FROM owner_businesses WHERE owner_key = ?').all(cleanOwner);
      for (const r of rows || []) {
        if (r && r.slug) ownerSlugs.add(String(r.slug).toLowerCase());
      }
    } catch {}
    try {
      const { getSupabase } = await import('./supabase.js');
      const sb = getSupabase();
      if (sb) {
        const { data: siteRows } = await sb
          .from('user_sites')
          .select('slug')
          .eq('owner_id', cleanOwner);
        for (const r of siteRows || []) {
          if (r && r.slug) ownerSlugs.add(String(r.slug).toLowerCase());
        }
        const { data: obRows } = await sb
          .from('owner_businesses')
          .select('slug')
          .eq('owner_key', cleanOwner);
        for (const r of obRows || []) {
          if (r && r.slug) ownerSlugs.add(String(r.slug).toLowerCase());
        }
      }
    } catch {}
  }

  // 3. Find all generated (non-revoked) PWA slugs for this owner across SQLite & Supabase
  const activeSlugsSet = new Set();
  try {
    const localCodes = db
      .prepare('SELECT slug, label, used_at, revoked_at FROM invite_codes WHERE revoked_at IS NULL')
      .all();
    for (const c of localCodes || []) {
      if (!c || !c.slug) continue;
      if (c.revoked_at !== null && c.revoked_at !== undefined) continue;
      const s = String(c.slug).toLowerCase();
      const labelMatch = cleanOwner && typeof c.label === 'string' && c.label.includes(`[owner:${cleanOwner}]`);
      if (ownerSlugs.has(s) || labelMatch || !cleanOwner) {
        activeSlugsSet.add(s);
      }
    }
  } catch {}

  try {
    const { getSupabase } = await import('./supabase.js');
    const sb = getSupabase();
    if (sb) {
      const { data: remoteCodes } = await sb
        .from('invite_codes')
        .select('slug, label, used_at, revoked_at')
        .is('revoked_at', null);
      for (const c of remoteCodes || []) {
        if (!c || !c.slug) continue;
        const s = String(c.slug).toLowerCase();
        const labelMatch = cleanOwner && typeof c.label === 'string' && c.label.includes(`[owner:${cleanOwner}]`);
        if (ownerSlugs.has(s) || labelMatch || !cleanOwner) {
          activeSlugsSet.add(s);
        }
      }
    }
  } catch {}

  const activeSlugs = Array.from(activeSlugsSet);
  const activeCount = activeSlugs.length;

  return {
    ownerKey: cleanOwner || null,
    plan: finalPlan,
    maxAllowed,
    activeCount,
    activeSlugs,
    remaining: Math.max(0, maxAllowed - activeCount),
    quotaExceeded: activeCount >= maxAllowed,
  };
}


