// Admin Plan & Credits Grant Service
// Persists plan tiers, Lunao (action) credits, and AI (vibe coding) credits
// permanently to Supabase without altering any existing credit deduction logic.
import { db } from './db.js';
import { getPgPool } from './supabase.js';
import { supabase as supabaseCfg } from './config.js';
import { normalisePlan } from './planGates.js';
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

function decodeActionBalance(row, fallback = 0) {
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

async function sbRestFetch(pathWithQuery, options = {}) {
  const { sbUrl, sbKey } = getSbRest();
  if (!sbUrl || !sbKey) throw new Error('Supabase REST credentials not configured');
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${sbUrl}/rest/v1/${pathWithQuery}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(5000),
  });
  return res;
}

/**
 * Fetches user_plans, user_credits, and lunao_users maps from Supabase to enrich /api/admin/overview.
 * Never throws; returns empty maps on transient errors so overview keeps working.
 */
export async function fetchAdminUserDetailsMaps() {
  const plansByUser = new Map();
  const creditsByUser = new Map();
  const profilesByUser = new Map();

  const pool = getPgPool();
  if (pool) {
    try {
      const [plansRes, credsRes, usersRes] = await Promise.all([
        pool.query('SELECT user_id, plan_tier, plan_expires_at, plan_purchased_at, ai_credits_balance, updated_at FROM public.user_plans').catch(() => ({ rows: [] })),
        pool.query('SELECT user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, updated_at FROM public.user_credits').catch(() => ({ rows: [] })),
        pool.query('SELECT owner_key, email, name, last_login_at, created_at FROM public.lunao_users').catch(() => ({ rows: [] })),
      ]);
      for (const r of plansRes.rows || []) {
        if (r.user_id) plansByUser.set(r.user_id, r);
      }
      for (const r of credsRes.rows || []) {
        if (r.user_id) creditsByUser.set(r.user_id, r);
      }
      for (const r of usersRes.rows || []) {
        if (r.owner_key) profilesByUser.set(r.owner_key, r);
      }
      if (plansByUser.size > 0 || creditsByUser.size > 0 || profilesByUser.size > 0) {
        return { plansByUser, creditsByUser, profilesByUser, decodeActionBalance };
      }
    } catch {}
  }

  try {
    const [plansRes, credsRes, usersRes] = await Promise.all([
      sbRestFetch('user_plans?select=user_id,plan_tier,plan_expires_at,plan_purchased_at,ai_credits_balance,updated_at').catch(() => null),
      sbRestFetch('user_credits?select=user_id,action_credits_balance,ai_credits_balance,ai_dollars_spent,updated_at').catch(() => null),
      sbRestFetch('lunao_users?select=owner_key,email,name,last_login_at,created_at').catch(() => null),
    ]);
    const plansRows = plansRes && plansRes.ok ? await plansRes.json() : [];
    const credsRows = credsRes && credsRes.ok ? await credsRes.json() : [];
    const usersRows = usersRes && usersRes.ok ? await usersRes.json() : [];

    if (Array.isArray(plansRows)) {
      for (const r of plansRows) {
        if (r?.user_id) plansByUser.set(r.user_id, r);
      }
    }
    if (Array.isArray(credsRows)) {
      for (const r of credsRows) {
        if (r?.user_id) creditsByUser.set(r.user_id, r);
      }
    }
    if (Array.isArray(usersRows)) {
      for (const r of usersRows) {
        if (r?.owner_key) profilesByUser.set(r.owner_key, r);
      }
    }
  } catch {}

  return { plansByUser, creditsByUser, profilesByUser, decodeActionBalance };
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
        const r = await sbRestFetch(`lunao_users?owner_key=eq.${encodeURIComponent(cleanKey)}&select=owner_key,email,name&limit=1`);
        if (r.ok) {
          const rows = await r.json();
          if (Array.isArray(rows) && rows[0]) profile = rows[0];
        }
      } catch {}
    }
    return { ownerKey: cleanKey, email: profile?.email || cleanEmail || '', name: profile?.name || '' };
  }

  if (cleanEmail) {
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT owner_key, email, name FROM public.lunao_users WHERE lower(email) = $1 LIMIT 1',
          [cleanEmail]
        );
        if (res.rows[0]?.owner_key) {
          return {
            ownerKey: res.rows[0].owner_key,
            email: res.rows[0].email || cleanEmail,
            name: res.rows[0].name || '',
          };
        }
      } catch {}
    }
    try {
      const r = await sbRestFetch(`lunao_users?email=ilike.${encodeURIComponent(cleanEmail)}&select=owner_key,email,name&limit=1`);
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]?.owner_key) {
          return {
            ownerKey: rows[0].owner_key,
            email: rows[0].email || cleanEmail,
            name: rows[0].name || '',
          };
        }
      }
    } catch {}
    throw Object.assign(new Error(`No user account found with email "${email}". Try entering their owner_key directly.`), { status: 404 });
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
      } catch (credErr) {
        // If action_credits_balance column is int32 in PG, store integer part + fractional tail in updated_at
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
    const planPayload = {
      user_id: targetKey,
      plan_tier: nextPlan,
      monthly_action_credits: monthlyActionCredits,
      monthly_ai_credits: monthlyAiCredits,
      monthly_ai_allowance_usd: monthlyAiAllowanceUsd,
      ai_credits_balance: roundedAiInt,
      plan_purchased_at: nextPurchasedAt,
      plan_expires_at: nextExpiresAt,
      updated_at: encoded.updated_at,
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

    const [pUpsert, cUpsert] = await Promise.all([
      sbRestFetch('user_plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(planPayload),
      }),
      sbRestFetch('user_credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(credPayload),
      }),
    ]);

    if (!pUpsert.ok) {
      const msg = await pUpsert.text().catch(() => pUpsert.statusText);
      throw new Error(`Failed to persist user_plans in Supabase: ${msg}`);
    }
    if (!cUpsert.ok) {
      const msg = await cUpsert.text().catch(() => cUpsert.statusText);
      throw new Error(`Failed to persist user_credits in Supabase: ${msg}`);
    }

    await sbRestFetch('credit_accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(acctPayload),
    }).catch(() => {});

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
