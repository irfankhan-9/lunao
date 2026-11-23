// Admin Plan & Credits Grant Service
// Persists plan tiers, Lunao (action) credits, and AI (vibe coding) credits
// permanently to Supabase without altering any existing credit deduction logic.
import { db } from './db.js';
import { getPgPool } from './supabase.js';
import { supabase as supabaseCfg } from './config.js';
import { normalisePlan, pwaAllowanceForPlan } from './planGates.js';
import { invalidateLocalAiAccountCache } from './ai/accountingService.js';

export const ADMIN_PLAN_DEFAULTS = Object.freeze({
  'Free Plan': { lunaoCredits: 15, aiCredits: 0, aiAllowanceUsd: 0 },
  'Starter Plan': { lunaoCredits: 2500, aiCredits: 600, aiAllowanceUsd: 6.0 },
  'Pro Plan': { lunaoCredits: 6500, aiCredits: 1300, aiAllowanceUsd: 13.0 },
  'Agency Plan': { lunaoCredits: 12000, aiCredits: 2000, aiAllowanceUsd: 20.0 },
});

function getSbRest() {
  const sbUrl = process.env.SUPABASE_URL || supabaseCfg?.url || 'https://wqlbuadknltsjfzrltpe.supabase.co';
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseCfg?.secretKey || '';
  return { sbUrl, sbKey };
}

function encodeActionBalance(rawBalance, nowMs = Date.now()) {
  const safe = Math.max(0, Math.round(Number(rawBalance || 0) * 10) / 10);
  const intPart = Math.floor(safe);
  const tenthPart = Math.round((safe - intPart) * 10);
  const updatedAt = Math.floor(nowMs / 1000) * 1000 + 700 + Math.min(9, Math.max(0, tenthPart));
  return { action_credits_balance: intPart, updated_at: updatedAt, exactBalance: safe };
}

export function decodeActionBalance(row, fallback = 0) {
  if (!row || row.action_credits_balance === null || row.action_credits_balance === undefined) return fallback;
  const num = Number(row.action_credits_balance);
  if (!Number.isFinite(num)) return fallback;
  const tail = Number(row.updated_at || 0) % 1000;
  if (tail >= 700 && tail <= 709 && Number.isInteger(num)) {
    const tenthPart = tail - 700;
    return Math.round((num + tenthPart / 10) * 10) / 10;
  }
  return Math.round(num * 10) / 10;
}

function inferEmailFromOwnerKey(ownerKey) {
  const raw = String(ownerKey || '').trim();
  const stripped = raw.startsWith('user_') ? raw.slice(5) : raw;
  return stripped.includes('@') && stripped.includes('.') ? stripped.toLowerCase() : '';
}

async function sbRestFetch(pathWithQuery, options = {}) {
  const { sbUrl, sbKey } = getSbRest();
  if (!sbUrl || !sbKey) throw new Error('Supabase REST credentials not configured');
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    ...(options.headers || {}),
  };
  return fetch(`${sbUrl}/rest/v1/${pathWithQuery}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(8000),
  });
}

async function fetchAllRestRows(tableAndSelect) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const res = await sbRestFetch(tableAndSelect, {
      headers: {
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    }).catch(() => null);
    if (!res || !res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function fetchAllSupabaseAuthUsers() {
  const { sbUrl, sbKey } = getSbRest();
  if (!sbUrl || !sbKey) return [];
  const out = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${sbUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (!res || !res.ok) break;
      const data = await res.json().catch(() => null);
      const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
      if (users.length === 0) break;
      out.push(...users);
      if (users.length < 1000) break;
    }
  } catch {}
  return out;
}

function attachAuthProfiles(authUsers, knownKeysSet, profilesByUser) {
  for (const au of authUsers) {
    const email = String(au?.email || au?.user_metadata?.email || '').trim().toLowerCase();
    const name = String(au?.user_metadata?.full_name || au?.user_metadata?.name || '').trim();
    const sub = String(au?.user_metadata?.sub || au?.user_metadata?.provider_id || '').trim();
    const uid = String(au?.id || '').trim();
    const candidates = [
      sub ? `user_${sub}` : null,
      email ? `user_${email}` : null,
      uid ? `user_${uid}` : null,
      uid || null,
    ].filter(Boolean);

    let matchedKey = candidates.find((k) => knownKeysSet.has(k));
    if (!matchedKey && candidates.length > 0) {
      matchedKey = candidates[0];
    }
    if (matchedKey) {
      profilesByUser.set(matchedKey, {
        owner_key: matchedKey,
        email,
        name,
        last_login_at: au?.last_sign_in_at ? Date.parse(au.last_sign_in_at) : null,
        created_at: au?.created_at ? Date.parse(au.created_at) : null,
      });
    }
  }
}

/**
 * Fetches user_plans, user_credits, credit_accounts, and Supabase Auth profiles.
 * Uses select=* so schema differences (like optional plan_expires_at) never 400.
 */
export async function fetchAdminUserDetailsMaps() {
  const plansByUser = new Map();
  const creditsByUser = new Map();
  const accountsByUser = new Map();
  const profilesByUser = new Map();
  const knownKeys = new Set();

  const pool = getPgPool();
  if (pool) {
    try {
      const [plansRes, credsRes, acctsRes, usersRes, authUsers] = await Promise.all([
        pool.query('SELECT * FROM public.user_plans').catch(() => ({ rows: [] })),
        pool.query('SELECT * FROM public.user_credits').catch(() => ({ rows: [] })),
        pool.query('SELECT * FROM public.credit_accounts').catch(() => ({ rows: [] })),
        pool.query('SELECT owner_key, email, name, last_login_at, created_at FROM public.lunao_users').catch(() => ({ rows: [] })),
        fetchAllSupabaseAuthUsers(),
      ]);
      for (const r of plansRes.rows || []) {
        if (r.user_id) {
          plansByUser.set(r.user_id, r);
          knownKeys.add(r.user_id);
        }
      }
      for (const r of credsRes.rows || []) {
        if (r.user_id) {
          creditsByUser.set(r.user_id, r);
          knownKeys.add(r.user_id);
        }
      }
      for (const r of acctsRes.rows || []) {
        if (r.owner_key) {
          accountsByUser.set(r.owner_key, r);
          knownKeys.add(r.owner_key);
        }
      }
      for (const r of usersRes.rows || []) {
        if (r.owner_key) {
          profilesByUser.set(r.owner_key, r);
          knownKeys.add(r.owner_key);
        }
      }
      attachAuthProfiles(authUsers, knownKeys, profilesByUser);
      if (plansByUser.size > 0 || creditsByUser.size > 0 || accountsByUser.size > 0 || profilesByUser.size > 0) {
        return { plansByUser, creditsByUser, accountsByUser, profilesByUser, decodeActionBalance };
      }
    } catch {}
  }

  try {
    const [plansRows, credsRows, acctsRows, authUsers] = await Promise.all([
      fetchAllRestRows('user_plans?select=*'),
      fetchAllRestRows('user_credits?select=*'),
      fetchAllRestRows('credit_accounts?select=*'),
      fetchAllSupabaseAuthUsers(),
    ]);

    for (const r of plansRows) {
      if (r?.user_id) {
        plansByUser.set(r.user_id, r);
        knownKeys.add(r.user_id);
      }
    }
    for (const r of credsRows) {
      if (r?.user_id) {
        creditsByUser.set(r.user_id, r);
        knownKeys.add(r.user_id);
      }
    }
    for (const r of acctsRows) {
      if (r?.owner_key) {
        accountsByUser.set(r.owner_key, r);
        knownKeys.add(r.owner_key);
      }
    }
    attachAuthProfiles(authUsers, knownKeys, profilesByUser);
  } catch {}

  return { plansByUser, creditsByUser, accountsByUser, profilesByUser, decodeActionBalance };
}

/**
 * Fast Admin Users list endpoint helper (skips heavy campaigns/csv_snapshot/sites queries)
 * so the Admin Panel & Plan Grant modal load every user instantly.
 */
export async function fetchAllAdminUsersFast() {
  const { plansByUser, creditsByUser, accountsByUser, profilesByUser } = await fetchAdminUserDetailsMaps();

  const allKeys = new Set([
    ...plansByUser.keys(),
    ...creditsByUser.keys(),
    ...accountsByUser.keys(),
    ...profilesByUser.keys(),
  ]);

  // Also include any user only present in local db cache
  try {
    const localRows = db.prepare('SELECT * FROM credit_accounts').all();
    for (const lr of localRows || []) {
      if (lr?.owner_key) {
        allKeys.add(lr.owner_key);
        if (!accountsByUser.has(lr.owner_key)) {
          accountsByUser.set(lr.owner_key, lr);
        }
      }
    }
  } catch {}

  const list = [];
  for (const k of allKeys) {
    const pRow = plansByUser.get(k);
    const cRow = creditsByUser.get(k);
    const aRow = accountsByUser.get(k);
    const uRow = profilesByUser.get(k);

    const email = uRow?.email || pRow?.email || inferEmailFromOwnerKey(k) || '';
    const name = uRow?.name || '';
    const plan = pRow?.plan_tier || aRow?.plan || 'Free Plan';
    const balance = cRow
      ? decodeActionBalance(cRow, Number(aRow?.balance ?? 0))
      : Number(aRow?.balance ?? 0);
    const aiVal =
      cRow && cRow.ai_credits_balance !== null && cRow.ai_credits_balance !== undefined
        ? Number(cRow.ai_credits_balance)
        : pRow && pRow.ai_credits_balance !== null && pRow.ai_credits_balance !== undefined
          ? Number(pRow.ai_credits_balance)
          : 0;

    const candidates = [uRow?.last_login_at, pRow?.updated_at, cRow?.updated_at, aRow?.updated_at, uRow?.created_at, aRow?.created_at]
      .map((v) => (v ? Number(v) : 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const lastActive = candidates.length > 0 ? Math.max(...candidates) : null;

    list.push({
      owner_key: k,
      email,
      name,
      plan,
      balance,
      aiCreditsBalance: Number.isFinite(aiVal) ? aiVal : 0,
      planExpiresAt: pRow?.plan_expires_at ? Number(pRow.plan_expires_at) : null,
      sitesRebranded: 0,
      sitesDeployed: 0,
      campaignsCount: 0,
      businessesRequested: 0,
      googleMapsCalls: 0,
      lastActive,
    });
  }

  list.sort((a, b) => (Number(b.lastActive || 0) - Number(a.lastActive || 0)));
  return list;
}

async function resolveOwnerKeyAndProfile({ ownerKey, email }) {
  const cleanKey = ownerKey ? String(ownerKey).trim() : '';
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const pool = getPgPool();

  if (cleanKey) {
    let profile = null;
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT owner_key, email, name FROM public.lunao_users WHERE owner_key = $1 LIMIT 1',
          [cleanKey]
        );
        if (res.rows[0]) profile = res.rows[0];
      } catch {}
    }
    if (!profile) {
      try {
        const pRes = await sbRestFetch(`user_plans?user_id=eq.${encodeURIComponent(cleanKey)}&select=user_id,email&limit=1`);
        if (pRes.ok) {
          const rows = await pRes.json();
          if (Array.isArray(rows) && rows[0]?.email) {
            profile = { owner_key: cleanKey, email: rows[0].email, name: '' };
          }
        }
      } catch {}
    }
    const inferredEmail = profile?.email || cleanEmail || inferEmailFromOwnerKey(cleanKey);
    return { ownerKey: cleanKey, email: inferredEmail, name: profile?.name || '' };
  }

  if (cleanEmail) {
    // 1. Check user_plans.email
    try {
      const pRes = await sbRestFetch(`user_plans?email=ilike.${encodeURIComponent(cleanEmail)}&select=user_id,email&limit=1`);
      if (pRes.ok) {
        const rows = await pRes.json();
        if (Array.isArray(rows) && rows[0]?.user_id) {
          return { ownerKey: rows[0].user_id, email: rows[0].email || cleanEmail, name: '' };
        }
      }
    } catch {}

    // 2. Check credit_accounts owner_key = user_<email>
    const emailKey = `user_${cleanEmail}`;
    try {
      const aRes = await sbRestFetch(`credit_accounts?owner_key=eq.${encodeURIComponent(emailKey)}&select=owner_key&limit=1`);
      if (aRes.ok) {
        const rows = await aRes.json();
        if (Array.isArray(rows) && rows[0]?.owner_key) {
          return { ownerKey: rows[0].owner_key, email: cleanEmail, name: '' };
        }
      }
    } catch {}

    // 3. Check Supabase Auth users list
    try {
      const authUsers = await fetchAllSupabaseAuthUsers();
      const match = authUsers.find((u) => String(u?.email || '').trim().toLowerCase() === cleanEmail);
      if (match) {
        const sub = String(match.user_metadata?.sub || match.user_metadata?.provider_id || '').trim();
        const name = String(match.user_metadata?.full_name || match.user_metadata?.name || '').trim();
        const candidates = [
          sub ? `user_${sub}` : null,
          `user_${cleanEmail}`,
          `user_${match.id}`,
          match.id,
        ].filter(Boolean);
        for (const cand of candidates) {
          const checkPlan = await sbRestFetch(`user_plans?user_id=eq.${encodeURIComponent(cand)}&select=user_id&limit=1`).catch(() => null);
          if (checkPlan?.ok) {
            const r = await checkPlan.json();
            if (Array.isArray(r) && r[0]) return { ownerKey: cand, email: cleanEmail, name };
          }
          const checkCred = await sbRestFetch(`user_credits?user_id=eq.${encodeURIComponent(cand)}&select=user_id&limit=1`).catch(() => null);
          if (checkCred?.ok) {
            const r = await checkCred.json();
            if (Array.isArray(r) && r[0]) return { ownerKey: cand, email: cleanEmail, name };
          }
        }
        return { ownerKey: candidates[0], email: cleanEmail, name };
      }
    } catch {}

    // 4. Check lunao_users if present in PG
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT owner_key, email, name FROM public.lunao_users WHERE lower(email) = $1 LIMIT 1',
          [cleanEmail]
        );
        if (res.rows[0]?.owner_key) {
          return { ownerKey: res.rows[0].owner_key, email: res.rows[0].email || cleanEmail, name: res.rows[0].name || '' };
        }
      } catch {}
    }

    throw Object.assign(new Error(`No user account found with email "${email}". Select a user from the list or enter their owner_key directly.`), { status: 404 });
  }

  throw Object.assign(new Error('Either ownerKey or email is required'), { status: 400 });
}

async function readExistingAccountState(ownerKey) {
  let planRow = null;
  let credRow = null;
  let acctRow = null;

  const pool = getPgPool();
  if (pool) {
    try {
      const [pRes, cRes, aRes] = await Promise.all([
        pool.query('SELECT * FROM public.user_plans WHERE user_id = $1 LIMIT 1', [ownerKey]).catch(() => ({ rows: [] })),
        pool.query('SELECT * FROM public.user_credits WHERE user_id = $1 LIMIT 1', [ownerKey]).catch(() => ({ rows: [] })),
        pool.query('SELECT * FROM public.credit_accounts WHERE owner_key = $1 LIMIT 1', [ownerKey]).catch(() => ({ rows: [] })),
      ]);
      planRow = pRes.rows[0] || null;
      credRow = cRes.rows[0] || null;
      acctRow = aRes.rows[0] || null;
    } catch {}
  }

  if (!planRow || !credRow) {
    try {
      const [pRes, cRes, aRes] = await Promise.all([
        !planRow ? sbRestFetch(`user_plans?user_id=eq.${encodeURIComponent(ownerKey)}&select=*&limit=1`).catch(() => null) : null,
        !credRow ? sbRestFetch(`user_credits?user_id=eq.${encodeURIComponent(ownerKey)}&select=*&limit=1`).catch(() => null) : null,
        !acctRow ? sbRestFetch(`credit_accounts?owner_key=eq.${encodeURIComponent(ownerKey)}&select=*&limit=1`).catch(() => null) : null,
      ]);
      if (pRes && pRes.ok) {
        const rows = await pRes.json();
        if (Array.isArray(rows) && rows[0]) planRow = rows[0];
      }
      if (cRes && cRes.ok) {
        const rows = await cRes.json();
        if (Array.isArray(rows) && rows[0]) credRow = rows[0];
      }
      if (aRes && aRes.ok) {
        const rows = await aRes.json();
        if (Array.isArray(rows) && rows[0]) acctRow = rows[0];
      }
    } catch {}
  }

  if (!acctRow) {
    try {
      acctRow = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey) || null;
    } catch {}
  }

  return { planRow, credRow, acctRow };
}

async function restUpsertRow(table, filterCol, keyVal, payload) {
  // Try PATCH first if row exists; fall back to POST merge-duplicates
  const patchRes = await sbRestFetch(`${table}?${filterCol}=eq.${encodeURIComponent(keyVal)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (patchRes.ok) {
    const rows = await patchRes.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) return { ok: true, rows };
  } else if (patchRes.status === 400) {
    const errText = await patchRes.text().catch(() => '');
    return { ok: false, status: 400, errText };
  }

  const postRes = await sbRestFetch(table, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  });
  if (!postRes.ok) {
    const errText = await postRes.text().catch(() => postRes.statusText);
    return { ok: false, status: postRes.status, errText };
  }
  const rows = await postRes.json().catch(() => []);
  return { ok: true, rows };
}

/**
 * Permanently grants/updates a user's plan, Lunao (action) credits, and AI (vibe coding) credits
 * in Supabase (`user_plans`, `user_credits`, `credit_accounts`, `credit_transactions`) and syncs local caches.
 */
export async function adminGrantUserPlanAndCredits({
  ownerKey,
  email,
  plan = null,
  durationDays = 30,
  lunaoMode = 'keep',
  lunaoAmount = 0,
  aiMode = 'keep',
  aiAmount = 0,
  note = '',
}) {
  const resolved = await resolveOwnerKeyAndProfile({ ownerKey, email });
  const targetKey = resolved.ownerKey;
  const now = Date.now();

  const { planRow, credRow, acctRow } = await readExistingAccountState(targetKey);

  const existingPlan = normalisePlan(planRow?.plan_tier || acctRow?.plan || 'Free Plan');
  const nextPlan = plan && String(plan).trim() ? normalisePlan(plan) : existingPlan;
  const planDefaults = ADMIN_PLAN_DEFAULTS[nextPlan] || ADMIN_PLAN_DEFAULTS['Free Plan'];

  const currentLunao = credRow
    ? decodeActionBalance(credRow, Number(acctRow?.balance ?? 0))
    : Number(acctRow?.balance ?? 0);
  const currentAi = credRow && credRow.ai_credits_balance !== null && credRow.ai_credits_balance !== undefined
    ? Number(credRow.ai_credits_balance)
    : planRow && planRow.ai_credits_balance !== null && planRow.ai_credits_balance !== undefined
      ? Number(planRow.ai_credits_balance)
      : 0;

  let nextLunao = currentLunao;
  const cleanLunaoAmt = Number(lunaoAmount);
  if (lunaoMode === 'set') {
    if (!Number.isFinite(cleanLunaoAmt) || cleanLunaoAmt < 0) {
      throw Object.assign(new Error('Lunao credits amount must be >= 0'), { status: 400 });
    }
    nextLunao = Math.round(cleanLunaoAmt * 10) / 10;
  } else if (lunaoMode === 'add') {
    if (!Number.isFinite(cleanLunaoAmt)) {
      throw Object.assign(new Error('Lunao credits delta must be a finite number'), { status: 400 });
    }
    nextLunao = Math.max(0, Math.round((currentLunao + cleanLunaoAmt) * 10) / 10);
  }

  let nextAi = currentAi;
  const cleanAiAmt = Number(aiAmount);
  if (aiMode === 'set') {
    if (!Number.isFinite(cleanAiAmt) || cleanAiAmt < 0) {
      throw Object.assign(new Error('AI credits amount must be >= 0'), { status: 400 });
    }
    nextAi = Number(cleanAiAmt.toFixed(4));
  } else if (aiMode === 'add') {
    if (!Number.isFinite(cleanAiAmt)) {
      throw Object.assign(new Error('AI credits delta must be a finite number'), { status: 400 });
    }
    nextAi = Math.max(0, Number((currentAi + cleanAiAmt).toFixed(4)));
  }

  let nextExpiresAt = planRow?.plan_expires_at ? Number(planRow.plan_expires_at) : null;
  let nextPurchasedAt = planRow?.plan_purchased_at ? Number(planRow.plan_purchased_at) : null;

  if (nextPlan === 'Free Plan') {
    nextExpiresAt = null;
  } else if (plan && String(plan).trim()) {
    nextPurchasedAt = now;
    if (durationDays === null || durationDays === 'lifetime' || durationDays === '') {
      nextExpiresAt = null;
    } else {
      const daysNum = Number(durationDays);
      nextExpiresAt = Number.isFinite(daysNum) && daysNum > 0
        ? now + Math.round(daysNum * 24 * 60 * 60 * 1000)
        : null;
    }
  }

  const encoded = encodeActionBalance(nextLunao, now);
  const roundedAiInt = Math.round(nextAi);
  const nextAiDollarsSpent = aiMode === 'set' ? 0 : Number(credRow?.ai_dollars_spent || 0);
  const monthlyActionCredits = planDefaults.lunaoCredits;
  const monthlyAiCredits = Math.max(planDefaults.aiCredits, roundedAiInt);
  const monthlyAiAllowanceUsd = Number(Math.max(planDefaults.aiAllowanceUsd, nextAi * 0.01).toFixed(2));
  const pwaLimit = pwaAllowanceForPlan(nextPlan);

  const auditParts = [];
  if (plan && String(plan).trim()) {
    const expLabel = nextExpiresAt ? `${Math.round((nextExpiresAt - now) / 86400000)}d` : 'Lifetime';
    auditParts.push(`Plan: ${existingPlan} -> ${nextPlan} (${expLabel})`);
  }
  if (lunaoMode !== 'keep') {
    auditParts.push(`Lunao credits: ${currentLunao} -> ${nextLunao}`);
  }
  if (aiMode !== 'keep') {
    auditParts.push(`AI credits: ${currentAi} -> ${nextAi}`);
  }
  if (note && String(note).trim()) {
    auditParts.push(`Note: ${String(note).trim()}`);
  }
  const auditDesc = `Admin grant (${auditParts.join(' | ') || 'updated'})`;

  let wroteToSupabase = false;
  const pool = getPgPool();

  if (pool) {
    try {
      await pool.query(`
        ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS plan_expires_at BIGINT;
        ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS plan_purchased_at BIGINT;
      `).catch(() => {});

      await pool.query(
        `INSERT INTO public.user_plans (
           user_id, plan_tier, monthly_action_credits, monthly_ai_credits,
           monthly_ai_allowance_usd, ai_credits_balance, plan_purchased_at, plan_expires_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_tier = EXCLUDED.plan_tier,
           monthly_action_credits = EXCLUDED.monthly_action_credits,
           monthly_ai_credits = EXCLUDED.monthly_ai_credits,
           monthly_ai_allowance_usd = EXCLUDED.monthly_ai_allowance_usd,
           ai_credits_balance = EXCLUDED.ai_credits_balance,
           plan_purchased_at = COALESCE(EXCLUDED.plan_purchased_at, public.user_plans.plan_purchased_at),
           plan_expires_at = EXCLUDED.plan_expires_at,
           updated_at = EXCLUDED.updated_at`,
        [
          targetKey,
          nextPlan,
          monthlyActionCredits,
          monthlyAiCredits,
          monthlyAiAllowanceUsd,
          roundedAiInt,
          nextPurchasedAt,
          nextExpiresAt,
          encoded.updated_at,
        ]
      );

      try {
        await pool.query(
          `INSERT INTO public.user_credits (
             user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, updated_at
           )
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             action_credits_balance = EXCLUDED.action_credits_balance,
             ai_credits_balance = EXCLUDED.ai_credits_balance,
             ai_dollars_spent = EXCLUDED.ai_dollars_spent,
             updated_at = EXCLUDED.updated_at`,
          [targetKey, nextLunao, nextAi, nextAiDollarsSpent, encoded.updated_at]
        );
      } catch {
        await pool.query(
          `INSERT INTO public.user_credits (
             user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, updated_at
           )
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             action_credits_balance = EXCLUDED.action_credits_balance,
             ai_credits_balance = EXCLUDED.ai_credits_balance,
             ai_dollars_spent = EXCLUDED.ai_dollars_spent,
             updated_at = EXCLUDED.updated_at`,
          [targetKey, encoded.action_credits_balance, nextAi, nextAiDollarsSpent, encoded.updated_at]
        );
      }

      await pool.query(
        `INSERT INTO public.credit_accounts (owner_key, plan, balance, lifetime_used, lifetime_refunded, updated_at, created_at)
         VALUES ($1, $2, $3, 0, 0, $4, $4)
         ON CONFLICT (owner_key) DO UPDATE SET
           plan = EXCLUDED.plan,
           balance = EXCLUDED.balance,
           updated_at = EXCLUDED.updated_at`,
        [targetKey, nextPlan, nextLunao, now]
      ).catch(() => {});

      await pool.query(
        `INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
         VALUES ($1, 'admin_grant', $2, $3, $4)`,
        [targetKey, Math.round((nextLunao - currentLunao) * 10) / 10, auditDesc, now]
      ).catch(() => {});

      wroteToSupabase = true;
    } catch (pgErr) {
      console.warn('[adminGrants] Postgres pool grant fallback to REST:', pgErr.message);
    }
  }

  if (!wroteToSupabase) {
    const corePlanPayload = {
      user_id: targetKey,
      plan_tier: nextPlan,
      monthly_action_credits: monthlyActionCredits,
      monthly_ai_credits: monthlyAiCredits,
      monthly_ai_allowance_usd: monthlyAiAllowanceUsd,
      ai_credits_balance: roundedAiInt,
      pwa_business_limit: pwaLimit,
      updated_at: encoded.updated_at,
      ...(resolved.email ? { email: resolved.email } : {}),
    };

    const fullPlanPayload = {
      ...corePlanPayload,
      plan_purchased_at: nextPurchasedAt,
      plan_expires_at: nextExpiresAt,
    };

    const credPayload = {
      user_id: targetKey,
      action_credits_balance: encoded.action_credits_balance,
      ai_credits_balance: nextAi,
      ai_dollars_spent: nextAiDollarsSpent,
      updated_at: encoded.updated_at,
    };

    const acctPayload = {
      owner_key: targetKey,
      plan: nextPlan,
      balance: Math.round(nextLunao),
      updated_at: now,
      created_at: acctRow?.created_at || now,
    };

    let pUpsert = await restUpsertRow('user_plans', 'user_id', targetKey, fullPlanPayload);
    if (!pUpsert.ok && pUpsert.status === 400) {
      // Live Supabase user_plans may not have optional plan_expires_at/plan_purchased_at columns
      pUpsert = await restUpsertRow('user_plans', 'user_id', targetKey, corePlanPayload);
    }
    if (!pUpsert.ok) {
      throw new Error(`Failed to persist user_plans in Supabase: ${pUpsert.errText || pUpsert.status}`);
    }

    const cUpsert = await restUpsertRow('user_credits', 'user_id', targetKey, credPayload);
    if (!cUpsert.ok) {
      throw new Error(`Failed to persist user_credits in Supabase: ${cUpsert.errText || cUpsert.status}`);
    }

    await restUpsertRow('credit_accounts', 'owner_key', targetKey, acctPayload).catch(() => {});

    await sbRestFetch('credit_transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: targetKey,
        action_type: 'admin_grant',
        credits_charged: Math.round((nextLunao - currentLunao) * 10) / 10,
        description: auditDesc,
        created_at: now,
      }),
    }).catch(() => {});

    wroteToSupabase = true;
  }

  // Sync local in-memory db mirror & AI accounting cache so server-side reads see changes immediately
  try {
    const existingLocal = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(targetKey);
    if (!existingLocal) {
      db.prepare(
        `INSERT INTO credit_accounts (owner_key, plan, balance, lifetime_used, lifetime_refunded, updated_at, created_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(targetKey, nextPlan, nextLunao, now, now);
    } else {
      db.prepare(
        `UPDATE credit_accounts SET plan = ?, balance = ?, updated_at = ? WHERE owner_key = ?`
      ).run(nextPlan, nextLunao, now, targetKey);
    }
  } catch {}

  invalidateLocalAiAccountCache(targetKey);

  return {
    ownerKey: targetKey,
    email: resolved.email,
    name: resolved.name,
    plan: nextPlan,
    planExpiresAt: nextExpiresAt,
    balance: nextLunao,
    aiCreditsBalance: nextAi,
    wroteToSupabase,
  };
}
