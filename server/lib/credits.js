// Server-side credit economy for Lunao, synced with Supabase PostgreSQL.
//
// Manages:
//   1. ensureAccount(ownerKey, plan) -> on first sight, seed starting balance for plan tier
//                                      and create affiliate profile; top-up delta if plan changes.
//   2. charge(ownerKey, n, reason, ref) -> atomically deduct n credits from Supabase user_credits,
//                                         log row in credit_transactions, return new balance.
//   3. checkBalance(ownerKey, n)       -> read-only balance check against Supabase user_credits.
//   4. refund(ownerKey, n, reason, ref) -> credit back n to Supabase user_credits and log in credit_transactions.
//   5. listLedger(ownerKey, limit)     -> query credit_transactions log from Supabase.
import { db } from './db.js';
import { getPgPool } from './supabase.js';

// Plan -> starting action credit balance & AI allowance in USD
const PLAN_BALANCE = {
  'Free Plan': 15,
  'Starter Plan': 50,
  'Pro Plan': 6500,
  'Agency Plan': 12000,
};

const PLAN_AI_ALLOWANCE = {
  'Free Plan': 0.0,
  'Starter Plan': 10.0,
  'Pro Plan': 13.0,
  'Agency Plan': 20.0,
};

function balanceFor(plan) {
  return PLAN_BALANCE[plan] ?? PLAN_BALANCE['Free Plan'];
}

function aiAllowanceFor(plan) {
  return PLAN_AI_ALLOWANCE[plan] ?? PLAN_AI_ALLOWANCE['Free Plan'];
}

export function inferPlanFromOwnerKey(ownerKey, fallbackPlan = 'Free Plan') {
  if (!ownerKey) return fallbackPlan;
  const str = String(ownerKey).toLowerCase();
  if (str.includes('agency')) return 'Agency Plan';
  if (str.includes('pro')) return 'Pro Plan';
  if (str.includes('starter')) return 'Starter Plan';
  return fallbackPlan;
}

function generateReferralCode(ownerKey) {
  const clean = String(ownerKey || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(-6) || Math.random().toString(36).slice(2, 8).toUpperCase();
  const extra = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LUNAO-${suffix}-${extra}`;
}

// Check and apply 30-day plan expiration
export async function checkAndApplyPlanExpiration(ownerKey) {
  if (!ownerKey) return { expired: false };
  const pool = getPgPool();
  if (pool) {
    try {
      const planRes = await pool.query(
        'SELECT plan_tier, plan_expires_at, plan_purchased_at FROM public.user_plans WHERE user_id = $1 LIMIT 1',
        [ownerKey]
      );
      if (planRes.rows.length > 0) {
        const row = planRes.rows[0];
        const currentPlan = row.plan_tier || 'Free Plan';
        const expiresAt = row.plan_expires_at ? Number(row.plan_expires_at) : null;
        const now = Date.now();

        if (currentPlan !== 'Free Plan' && expiresAt && now >= expiresAt) {
          console.log(`[credits] Plan expired for ${ownerKey} (was ${currentPlan}, expired at ${new Date(expiresAt).toISOString()}). Resetting to Free Plan.`);

          // Revert user_plans to Free Plan
          await pool.query(
            `UPDATE public.user_plans 
             SET plan_tier = 'Free Plan',
                 monthly_action_credits = 15,
                 monthly_ai_allowance_usd = 0.0,
                 plan_expires_at = NULL,
                 updated_at = $1
             WHERE user_id = $2`,
            [now, ownerKey]
          );

          // Reset user_credits: cap action credits to 15, reset AI credits to 0
          await pool.query(
            `UPDATE public.user_credits 
             SET action_credits_balance = LEAST(action_credits_balance, 15),
                 ai_credits_balance = 0,
                 updated_at = $1
             WHERE user_id = $2`,
            [now, ownerKey]
          );

          // Record ledger event
          await pool.query(
            `INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
             VALUES ($1, 'plan_expired', 0, '30-day billing cycle completed, plan reset to Free Plan', $2)`,
            [ownerKey, now]
          );

          // Sync SQLite mirror
          try {
            db.prepare('UPDATE credit_accounts SET plan = ?, balance = MIN(balance, 15), updated_at = ? WHERE owner_key = ?')
              .run('Free Plan', now, ownerKey);
          } catch {}

          return { expired: true, previousPlan: currentPlan, currentPlan: 'Free Plan' };
        }
      }
    } catch (err) {
      console.warn('[credits] checkAndApplyPlanExpiration error:', err.message);
    }
  }
  return { expired: false };
}

// Ensure account & user_plans / user_credits / affiliates rows exist in Supabase
export async function ensureAccountAsync(ownerKey, plan) {
  if (!ownerKey) throw new Error('ownerKey is required');
  const safePlan = PLAN_BALANCE[plan] ? plan : 'Free Plan';
  const now = Date.now();
  const startingCredits = balanceFor(safePlan);
  const aiAllowance = aiAllowanceFor(safePlan);

  const pool = getPgPool();
  if (pool) {
    try {
      // Run column migration once (idempotent)
      await pool.query(`
        ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS plan_expires_at BIGINT;
        ALTER TABLE public.user_plans ADD COLUMN IF NOT EXISTS plan_purchased_at BIGINT;
      `).catch(() => {});

      // 1. Check existing plan & credits
      const planRes = await pool.query('SELECT * FROM public.user_plans WHERE user_id = $1 LIMIT 1', [ownerKey]);
      const credRes = await pool.query('SELECT * FROM public.user_credits WHERE user_id = $1 LIMIT 1', [ownerKey]);

      const initialAiCredits = safePlan.toLowerCase().includes('agency') ? 2000
        : safePlan.toLowerCase().includes('pro') || safePlan.toLowerCase().includes('growth') ? 1300
        : safePlan.toLowerCase().includes('starter') ? 600
        : 0;

      // New user registration / first appearance:
      if (planRes.rows.length === 0) {
        await pool.query(
          `INSERT INTO public.user_plans (user_id, plan_tier, monthly_action_credits, monthly_ai_allowance_usd, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO NOTHING`,
          [ownerKey, safePlan, startingCredits, aiAllowance, now]
        );
      }

      if (credRes.rows.length === 0) {
        await pool.query(
          `INSERT INTO public.user_credits (user_id, action_credits_balance, ai_credits_balance, ai_dollars_spent, updated_at)
           VALUES ($1, $2, $3, 0.0000, $4)
           ON CONFLICT (user_id) DO NOTHING`,
          [ownerKey, startingCredits, initialAiCredits, now]
        );

        await pool.query(
          `INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
           VALUES ($1, 'plan_topup', $2, $3, $4)`,
          [ownerKey, startingCredits, `Initial ${safePlan} balance allocation`, now]
        );

        const refCode = generateReferralCode(ownerKey);
        await pool.query(
          `INSERT INTO public.affiliates (user_id, referral_code, total_referrals, total_earnings_usd, created_at)
           VALUES ($1, $2, 0, 0.00, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [ownerKey, refCode, now]
        );
      } else if (planRes.rows.length > 0 && planRes.rows[0].plan_tier !== safePlan && safePlan !== 'Free Plan') {
        // Legitimate paid plan upgrade
        const oldPlan = planRes.rows[0].plan_tier;
        const delta = startingCredits - (balanceFor(oldPlan) || 0);
        const planExpiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days validity

        await pool.query(
          `UPDATE public.user_plans 
           SET plan_tier = $1, monthly_action_credits = $2, monthly_ai_allowance_usd = $3,
               plan_purchased_at = $4, plan_expires_at = $5, updated_at = $6
           WHERE user_id = $7`,
          [safePlan, startingCredits, aiAllowance, now, planExpiresAt, now, ownerKey]
        );

        if (delta > 0) {
          await pool.query(
            `UPDATE public.user_credits 
             SET action_credits_balance = action_credits_balance + $1,
                 ai_credits_balance = GREATEST(ai_credits_balance, $2),
                 updated_at = $3
             WHERE user_id = $4`,
            [delta, initialAiCredits, now, ownerKey]
          );

          await pool.query(
            `INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
             VALUES ($1, 'plan_switch', $2, $3, $4)`,
            [ownerKey, delta, `Plan upgrade to ${safePlan}`, now]
          );
        }
      }

      return await getAccountAsync(ownerKey);
    } catch (err) {
      console.warn('[credits] Supabase ensureAccount error:', err.message);
    }
  }

  // SQLite fallback for standalone mode
  return ensureAccountLocal(ownerKey, safePlan);
}

export function ensureAccount(ownerKey, plan) {
  const safePlan = PLAN_BALANCE[plan] ? plan : 'Free Plan';
  ensureAccountAsync(ownerKey, safePlan).catch((err) => {
    console.warn('[credits] ensureAccountAsync background error:', err.message);
  });
  return ensureAccountLocal(ownerKey, safePlan);
}

function ensureAccountLocal(ownerKey, safePlan) {
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
  if (!existing) {
    const starting = balanceFor(safePlan);
    db.transaction(() => {
      db.prepare(
        `INSERT INTO credit_accounts (owner_key, plan, balance, lifetime_used, lifetime_refunded, updated_at, created_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(ownerKey, safePlan, starting, now, now);
      if (starting > 0) {
        db.prepare(
          `INSERT INTO credit_ledger (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
           VALUES (?, ?, 'plan_topup', 'plan', ?, ?, ?)`
        ).run(ownerKey, starting, safePlan, starting, now);
      }
    })();
    return getAccountLocal(ownerKey);
  }

  if (existing.plan !== safePlan && safePlan !== 'Free Plan') {
    const target = balanceFor(safePlan);
    const delta = Math.max(0, target - existing.balance);
    db.transaction(() => {
      db.prepare(
        `UPDATE credit_accounts SET plan = ?, balance = balance + ?, updated_at = ? WHERE owner_key = ?`
      ).run(safePlan, delta, now, ownerKey);
      if (delta > 0) {
        db.prepare(
          `INSERT INTO credit_ledger (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
           VALUES (?, ?, 'plan_topup', 'plan', ?, ?, ?)`
        ).run(ownerKey, delta, safePlan, existing.balance + delta, now);
      }
    })();
  }
  return getAccountLocal(ownerKey);
}

export async function getAccountAsync(ownerKey) {
  if (!ownerKey) return null;
  const pool = getPgPool();
  if (pool) {
    try {
      const planRes = await pool.query('SELECT * FROM user_plans WHERE user_id = $1 LIMIT 1', [ownerKey]);
      const credRes = await pool.query('SELECT * FROM user_credits WHERE user_id = $1 LIMIT 1', [ownerKey]);

      if (planRes.rows.length > 0 && credRes.rows.length > 0) {
        const p = planRes.rows[0];
        const c = credRes.rows[0];
        return {
          ownerKey,
          plan: p.plan_tier || 'Free Plan',
          balance: Number(c.action_credits_balance || 0),
          aiCreditsBalance: Number(c.ai_credits_balance || 0),
          aiDollarsSpent: Number(c.ai_dollars_spent || 0),
          monthlyAiAllowanceUsd: Number(p.monthly_ai_allowance_usd || 0),
          updatedAt: Number(c.updated_at || Date.now()),
        };
      }
    } catch (err) {
      console.warn('[credits] getAccountAsync error:', err.message);
    }
  }
  return getAccountLocal(ownerKey);
}

export function getAccount(ownerKey) {
  return getAccountLocal(ownerKey);
}

function getAccountLocal(ownerKey) {
  if (!ownerKey) return null;
  const row = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
  if (!row) return null;
  return {
    ownerKey: row.owner_key,
    plan: row.plan,
    balance: row.balance,
    lifetimeUsed: row.lifetime_used,
    lifetimeRefunded: row.lifetime_refunded,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export const COST_PER_EMAIL_FOUND = 1.5;

function normalizeCreditAmount(n) {
  const num = Math.round(Number(n) * 10) / 10;
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export async function chargeAsync(ownerKey, n, actionType = 'action_charge', description = '') {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  const amount = normalizeCreditAmount(n);
  if (amount <= 0) {
    throw Object.assign(new Error('amount must be a positive number'), { status: 400 });
  }

  const pool = getPgPool();
  if (pool) {
    try {
      await checkAndApplyPlanExpiration(ownerKey);

      const now = Date.now();
      // One-way atomic deduction: guarantees balance cannot drop below 0 or suffer race conditions
      const updateRes = await pool.query(
        `UPDATE public.user_credits 
         SET action_credits_balance = ROUND((action_credits_balance - $1)::numeric, 1), 
             updated_at = $2 
         WHERE user_id = $3 AND action_credits_balance >= $1
         RETURNING action_credits_balance`,
        [amount, now, ownerKey]
      );

      if (updateRes.rows.length === 0) {
        const curRes = await pool.query('SELECT action_credits_balance FROM public.user_credits WHERE user_id = $1 LIMIT 1', [ownerKey]);
        const curBal = curRes.rows.length > 0 ? Number(curRes.rows[0].action_credits_balance || 0) : 0;
        const err = new Error(`Insufficient credits: need ${amount}, have ${curBal}. Upgrade your plan to continue.`);
        err.status = 402;
        err.needed = amount;
        err.available = curBal;
        throw err;
      }

      const newBalance = Number(updateRes.rows[0].action_credits_balance);

      await pool.query(
        `INSERT INTO public.credit_transactions (user_id, action_type, credits_charged, description, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [ownerKey, actionType, amount, description || actionType, now]
      );

      try {
        db.prepare('UPDATE credit_accounts SET balance = ?, updated_at = ? WHERE owner_key = ?').run(newBalance, now, ownerKey);
      } catch {}

      return newBalance;
    } catch (err) {
      if (err.status) throw err;
      console.warn('[credits] chargeAsync error:', err.message);
    }
  }

  return chargeLocal(ownerKey, amount, actionType, description);
}

export function charge(ownerKey, n, reason, ref = {}) {
  const amount = normalizeCreditAmount(n);
  if (getPgPool()) {
    chargeAsync(ownerKey, amount, reason || 'charge', ref?.id ? `${ref.type || ''}:${ref.id}` : '').catch((err) => {
      if (err.status !== 402) {
        console.warn('[credits] chargeAsync background notice:', err.message);
      }
    });
  }
  return chargeLocal(ownerKey, amount, reason, ref);
}

function chargeLocal(ownerKey, n, reason, ref = {}) {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  const amount = normalizeCreditAmount(n);
  if (amount <= 0) {
    throw Object.assign(new Error('amount must be a positive number'), { status: 400 });
  }
  const now = Date.now();
  const txn = db.transaction(() => {
    let row = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
    if (!row) {
      ensureAccountLocal(ownerKey, 'Free Plan');
      row = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
    }
    if (!row || row.balance < amount) {
      const available = row ? row.balance : 0;
      const err = new Error(`Insufficient credits: need ${amount}, have ${available}. Top up to continue.`);
      err.status = 402;
      err.needed = amount;
      err.available = available;
      throw err;
    }
    const newBalance = Math.round((row.balance - amount) * 10) / 10;
    db.prepare('UPDATE credit_accounts SET balance = ?, lifetime_used = lifetime_used + ?, updated_at = ? WHERE owner_key = ?')
      .run(newBalance, amount, now, ownerKey);
    db.prepare(
      `INSERT INTO credit_ledger (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ownerKey, -amount, reason || 'manual_charge', ref.type || null, ref.id ? String(ref.id) : null, newBalance, now);
    return newBalance;
  });
  return txn();
}

export async function checkBalanceAsync(ownerKey, n = 1) {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  const amount = normalizeCreditAmount(n);
  const pool = getPgPool();
  if (pool) {
    try {
      await checkAndApplyPlanExpiration(ownerKey);
      const credRes = await pool.query('SELECT action_credits_balance FROM public.user_credits WHERE user_id = $1 LIMIT 1', [ownerKey]);
      if (credRes.rows.length === 0) {
        throw Object.assign(new Error('No credit account found.'), { status: 400 });
      }
      const balance = Number(credRes.rows[0].action_credits_balance || 0);
      if (balance < amount) {
        const err = new Error(`Insufficient credits: need ${amount}, have ${balance}. Top up to continue.`);
        err.status = 402;
        err.needed = amount;
        err.available = balance;
        throw err;
      }
      return balance;
    } catch (err) {
      if (err.status) throw err;
      console.warn('[credits] checkBalanceAsync notice:', err.message);
    }
  }
  return checkBalanceLocal(ownerKey, amount);
}

export function checkBalance(ownerKey, n = 1) {
  return checkBalanceLocal(ownerKey, normalizeCreditAmount(n));
}

function checkBalanceLocal(ownerKey, n = 1) {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  const amount = normalizeCreditAmount(n);
  let row = db.prepare('SELECT balance, plan FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
  if (!row) {
    ensureAccountLocal(ownerKey, 'Free Plan');
    row = db.prepare('SELECT balance, plan FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
  }
  const available = row ? row.balance : 0;
  if (available < amount) {
    const err = new Error(`Insufficient credits: need ${amount}, have ${available}. Top up to continue.`);
    err.status = 402;
    err.needed = amount;
    err.available = available;
    throw err;
  }
  return available;
}

export async function refundAsync(ownerKey, n, actionType = 'refund', description = '') {
  const amount = normalizeCreditAmount(n);
  if (!ownerKey || amount <= 0) return null;
  const pool = getPgPool();
  if (pool) {
    try {
      const now = Date.now();
      await pool.query(
        `UPDATE user_credits SET action_credits_balance = action_credits_balance + $1, updated_at = $2 WHERE user_id = $3`,
        [amount, now, ownerKey]
      );
      await pool.query(
        `INSERT INTO credit_transactions (user_id, action_type, credits_charged, description, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [ownerKey, actionType, -amount, description || actionType, now]
      );
      return await getAccountAsync(ownerKey);
    } catch (err) {
      console.warn('[credits] refundAsync notice:', err.message);
    }
  }
  return refundLocal(ownerKey, amount, actionType, { type: 'refund', id: description });
}

export function refund(ownerKey, n, reason, ref = {}) {
  const amount = normalizeCreditAmount(n);
  if (amount <= 0) return getAccountLocal(ownerKey);
  if (getPgPool()) {
    refundAsync(ownerKey, amount, reason, ref?.id ? String(ref.id) : '').catch(() => {});
  }
  return refundLocal(ownerKey, amount, reason, ref);
}

function refundLocal(ownerKey, n, reason, ref = {}) {
  const amount = normalizeCreditAmount(n);
  if (!ownerKey || amount <= 0) return null;
  const now = Date.now();
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey);
    if (!row) return null;
    const newBalance = Math.round((row.balance + amount) * 10) / 10;
    db.prepare('UPDATE credit_accounts SET balance = ?, lifetime_refunded = lifetime_refunded + ?, updated_at = ? WHERE owner_key = ?')
      .run(newBalance, amount, now, ownerKey);
    db.prepare(
      `INSERT INTO credit_ledger (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ownerKey, amount, reason || 'manual_refund', ref.type || null, ref.id ? String(ref.id) : null, newBalance, now);
    return newBalance;
  });
  txn();
  return getAccountLocal(ownerKey);
}

export function reserveEmailDiscoveryCredits(ownerKey, targetLeads, ref = {}) {
  const reservedCredits = Math.round(Math.max(1, Number(targetLeads) || 1) * COST_PER_EMAIL_FOUND * 10) / 10;
  const balanceAfterReserve = charge(ownerKey, reservedCredits, 'email_discovery_reserve', ref);
  return {
    reservedCredits,
    balanceAfterReserve,
  };
}

export function settleEmailDiscoveryCredits(ownerKey, reservedCredits, emailsFoundCount, ref = {}) {
  const found = Math.max(0, Number(emailsFoundCount) || 0);
  const creditsCharged = Math.round(found * COST_PER_EMAIL_FOUND * 10) / 10;
  const creditsRefunded = Math.max(0, Math.round((reservedCredits - creditsCharged) * 10) / 10);
  let account = null;
  if (creditsRefunded > 0) {
    account = refund(ownerKey, creditsRefunded, 'email_discovery_unused_refund', ref);
  } else {
    account = getAccountLocal(ownerKey);
  }
  return {
    creditsCharged,
    creditsRefunded,
    newBalance: account ? account.balance : null,
  };
}

export async function listLedgerAsync(ownerKey, limit = 50) {
  if (!ownerKey) return [];
  const pool = getPgPool();
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [ownerKey, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
      );
      return rows.map((r) => ({
        id: r.id,
        ownerKey: r.user_id,
        actionType: r.action_type,
        creditsCharged: Number(r.credits_charged || 0),
        aiDollarsCharged: Number(r.ai_dollars_charged || 0),
        description: r.description,
        createdAt: Number(r.created_at || Date.now()),
      }));
    } catch (err) {
      console.warn('[credits] listLedgerAsync notice:', err.message);
    }
  }
  return listLedgerLocal(ownerKey, limit);
}

export function listLedger(ownerKey, limit = 50) {
  return listLedgerLocal(ownerKey, limit);
}

function listLedgerLocal(ownerKey, limit = 50) {
  if (!ownerKey) return [];
  const rows = db.prepare(
    `SELECT * FROM credit_ledger WHERE owner_key = ? ORDER BY created_at DESC LIMIT ?`
  ).all(ownerKey, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
  return rows.map((row) => ({
    id: row.id,
    ownerKey: row.owner_key,
    delta: row.delta,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  }));
}

export function planBalanceFor(plan) {
  return balanceFor(plan);
}

export { PLAN_BALANCE, PLAN_AI_ALLOWANCE };
