// Server-side Affiliate & Referral Engine for Lunao (40% recurring commission model)
import { getPgPool } from './supabase.js';
import { db } from './db.js';
import {
  isSpecialAffiliateModeActive,
  getSpecialModePayoutEmail,
  setSpecialModePayoutEmail,
} from './specialModeSites.js';

const PLAN_PRICES = {
  'Free Plan': 0.00,
  'Starter Plan': 97.00,
  'Pro Plan': 187.00,
  'Agency Plan': 297.00,
  'Free': 0.00,
  'Starter': 97.00,
  'Pro': 187.00,
  'Agency': 297.00,
};

function normalizePlanTier(raw) {
  const p = String(raw || 'Free Plan').trim();
  if (p.toLowerCase().includes('agency')) return 'Agency Plan';
  if (p.toLowerCase().includes('pro')) return 'Pro Plan';
  if (p.toLowerCase().includes('starter')) return 'Starter Plan';
  return 'Free Plan';
}

function generateReferralCode(userId) {
  const clean = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(-6) || Math.random().toString(36).slice(2, 8).toUpperCase();
  const extra = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LUNAO-${suffix}-${extra}`;
}

let tablesEnsured = false;
let tablesEnsuring = null;

export async function ensureAffiliatesTables() {
  if (tablesEnsured) return;
  if (tablesEnsuring) return tablesEnsuring;

  tablesEnsuring = (async () => {
    // 1. Ensure SQLite mirror tables
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS affiliates (
          user_id TEXT PRIMARY KEY,
          referral_code TEXT UNIQUE,
          total_referrals INTEGER DEFAULT 0,
          total_earnings_usd REAL DEFAULT 0.0,
          payout_email TEXT,
          created_at INTEGER,
          updated_at INTEGER
        );
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS referrals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          affiliate_user_id TEXT NOT NULL,
          referred_user_id TEXT UNIQUE NOT NULL,
          referred_user_email TEXT,
          plan_tier TEXT DEFAULT 'Free Plan',
          monthly_revenue_usd REAL DEFAULT 0.0,
          commission_rate REAL DEFAULT 0.40,
          earned_usd REAL DEFAULT 0.0,
          status TEXT DEFAULT 'active',
          created_at INTEGER,
          updated_at INTEGER
        );
      `).run();
    } catch (sqliteErr) {
      console.warn('[affiliates] SQLite tables notice:', sqliteErr.message);
    }

    // 2. Ensure PostgreSQL Supabase tables
    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS public.affiliates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL UNIQUE,
            referral_code TEXT NOT NULL UNIQUE,
            total_referrals INTEGER NOT NULL DEFAULT 0,
            total_earnings_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            payout_email TEXT,
            created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
            updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
          );

          CREATE TABLE IF NOT EXISTS public.referrals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            affiliate_user_id TEXT NOT NULL,
            referred_user_id TEXT NOT NULL UNIQUE,
            referred_user_email TEXT NOT NULL DEFAULT '',
            plan_tier TEXT NOT NULL DEFAULT 'Free Plan',
            monthly_revenue_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 0.40,
            earned_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            status TEXT NOT NULL DEFAULT 'active',
            created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
            updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
          );

          CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(referral_code);
          CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON public.referrals(affiliate_user_id);
          CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);
        `);
      } catch (pgErr) {
        console.warn('[affiliates] Postgres ensure notice:', pgErr.message);
      }
    }

    tablesEnsured = true;
    tablesEnsuring = null;
  })();

  return tablesEnsuring;
}

function buildSpecialAffiliateProfile(userId, payoutEmail) {
  const now = Date.now();
  const DAY_MS = 86400000;

  // 34 client referral accounts: 23 paid active subscribers ($1,840.00/mo commission) + 11 free trials
  const mockClients = [
    // 8 Agency Plans ($297.00/mo -> $118.80/mo commission each = $950.40)
    { email: 'marcus@summitbarberlounge.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 2, status: 'active' },
    { email: 'dr.chen@apexsmilesdental.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 5, status: 'active' },
    { email: 'dave@everesthvacpro.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 9, status: 'active' },
    { email: 'sarah@glamourloungeatx.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 14, status: 'active' },
    { email: 'mike@ironpeakcrossfit.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 21, status: 'active' },
    { email: 'tyler@precisionroofingservices.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 28, status: 'active' },
    { email: 'rachel@vanguardrealtygroup.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 36, status: 'active' },
    { email: 'carlos@noblehoundgrooming.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 44, status: 'active' },

    // 8 Pro Plans ($187.00/mo -> $74.80/mo commission each = $598.40)
    { email: 'jason@austinfadefactory.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 4, status: 'active' },
    { email: 'dr.morales@brightdentalstudio.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 11, status: 'active' },
    { email: 'kevin@allseasonshvacatx.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 18, status: 'active' },
    { email: 'amanda@bellissimahairsalon.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 26, status: 'active' },
    { email: 'brandon@apexfitnessclub.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 33, status: 'active' },
    { email: 'liam@shieldroofingsolutions.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 41, status: 'active' },
    { email: 'sophia@urbanestatesaustin.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 50, status: 'active' },
    { email: 'elena@solasalonstudios.net', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 58, status: 'active' },

    // 6 Starter Plans ($97.00/mo -> $38.80/mo commission each = $232.80)
    { email: 'derek@craftbarbershop.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 7, status: 'active' },
    { email: 'nina@blissavedasalon.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 15, status: 'active' },
    { email: 'tom@coastalairconditioning.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 23, status: 'active' },
    { email: 'alex@elevatebarberco.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 31, status: 'active' },
    { email: 'hannah@glowskincaredenver.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 47, status: 'active' },
    { email: 'greg@summitroofingrepair.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 62, status: 'active' },

    // 1 Starter Plan + Concierge Automation ($146.00/mo -> $58.40/mo commission)
    { email: 'sam@zenithbodyworks.com', plan: 'Starter Plan', rev: 146.00, comm: 58.40, daysAgo: 69, status: 'active' },

    // 11 Free Plan / Trial Lead Pipeline ($0.00/mo)
    { email: 'leo@texaspatioconstruct.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 1, status: 'active' },
    { email: 'maya@radiancewellnessatx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 3, status: 'active' },
    { email: 'chris@hillcountryplumbing.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 6, status: 'active' },
    { email: 'jessica@pureluxeesthetics.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 10, status: 'active' },
    { email: 'owen@redwoodlandscapetx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 13, status: 'active' },
    { email: 'natalie@lunarstudiosbarber.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 17, status: 'active' },
    { email: 'dean@apexautobodyatx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 24, status: 'active' },
    { email: 'chloe@velvetlashbar.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 35, status: 'active' },
    { email: 'victor@bravopaintingpros.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 49, status: 'active' },
    { email: 'olivia@zenbeautylounge.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 65, status: 'active' },
    { email: 'brian@lonestarhvacservice.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 78, status: 'active' },
  ];

  const referrals = mockClients.map((c, idx) => ({
    id: 84000 + idx,
    referredUserId: `usr_ref_${c.email.split('@')[0]}`,
    referredUserEmail: c.email,
    planTier: c.plan,
    monthlyRevenueUsd: c.rev,
    commissionRate: 0.40,
    earnedUsd: c.comm,
    status: c.status,
    createdAt: now - c.daysAgo * DAY_MS - (idx * 3600000),
  }));

  const totalEarningsUsd = referrals.reduce((sum, r) => sum + r.earnedUsd, 0);

  return {
    userId: userId || 'dashboard',
    referralCode: 'LUNAO-VIP-PARTNER',
    referralLink: 'https://lunao-web-designn.pages.dev/?ref=LUNAO-VIP-PARTNER',
    totalReferrals: referrals.length,
    totalEarningsUsd: Math.round(totalEarningsUsd * 100) / 100, // Exactly $1,840.00
    payoutEmail: payoutEmail || 'josh@apexgrowthmedia.com',
    referrals,
  };
}

export async function getAffiliateProfileAsync(userId) {
  if (!userId) return null;

  // Intercept if special mode (affiliate, sales, ugc) is active on this session
  if (isSpecialAffiliateModeActive(userId)) {
    const payoutEmail = getSpecialModePayoutEmail(userId);
    return buildSpecialAffiliateProfile(userId, payoutEmail);
  }

  await ensureAffiliatesTables();

  const pool = getPgPool();
  const now = Date.now();
  const cleanUser = String(userId).trim();

  const baseUrl = process.env.SITE_BASE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://lunao-web-designn.pages.dev');

  if (pool) {
    try {
      // 1. Fetch or create affiliate profile
      let affRes = await pool.query('SELECT * FROM public.affiliates WHERE user_id = $1 LIMIT 1', [cleanUser]);
      if (affRes.rows.length === 0) {
        const refCode = generateReferralCode(cleanUser);
        await pool.query(
          `INSERT INTO public.affiliates (user_id, referral_code, total_referrals, total_earnings_usd, created_at, updated_at)
           VALUES ($1, $2, 0, 0.00, $3, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [cleanUser, refCode, now]
        );
        affRes = await pool.query('SELECT * FROM public.affiliates WHERE user_id = $1 LIMIT 1', [cleanUser]);
      }

      const aff = affRes.rows[0];

      // 2. Fetch all referrals for this affiliate
      const refRes = await pool.query(
        'SELECT * FROM public.referrals WHERE affiliate_user_id = $1 ORDER BY created_at DESC',
        [cleanUser]
      );

      const referrals = refRes.rows.map((r) => ({
        id: r.id,
        referredUserId: r.referred_user_id,
        referredUserEmail: r.referred_user_email || 'Referred Client',
        planTier: normalizePlanTier(r.plan_tier),
        monthlyRevenueUsd: Number(r.monthly_revenue_usd || 0),
        commissionRate: Number(r.commission_rate || 0.40),
        earnedUsd: Number(r.earned_usd || 0),
        status: r.status || 'active',
        createdAt: Number(r.created_at || now),
      }));

      const totalEarnings = referrals.reduce((sum, r) => sum + r.earnedUsd, 0);

      return {
        userId: aff.user_id,
        referralCode: aff.referral_code,
        referralLink: `${baseUrl}/?ref=${aff.referral_code}`,
        totalReferrals: referrals.length,
        totalEarningsUsd: Math.round(totalEarnings * 100) / 100,
        payoutEmail: aff.payout_email || null,
        referrals,
      };
    } catch (err) {
      console.warn('[affiliates] getAffiliateProfileAsync Postgres notice:', err.message);
    }
  }

  // SQLite Mirror Fallback
  try {
    let aff = db.prepare('SELECT * FROM affiliates WHERE user_id = ?').get(cleanUser);
    if (!aff) {
      const refCode = generateReferralCode(cleanUser);
      db.prepare(`
        INSERT INTO affiliates (user_id, referral_code, total_referrals, total_earnings_usd, created_at, updated_at)
        VALUES (?, ?, 0, 0.0, ?, ?)
        ON CONFLICT (user_id) DO NOTHING
      `).run(cleanUser, refCode, now, now);
      aff = db.prepare('SELECT * FROM affiliates WHERE user_id = ?').get(cleanUser);
    }

    const rows = db.prepare('SELECT * FROM referrals WHERE affiliate_user_id = ? ORDER BY created_at DESC').all(cleanUser);
    const referrals = (rows || []).map((r) => ({
      id: r.id,
      referredUserId: r.referred_user_id,
      referredUserEmail: r.referred_user_email || 'Referred Client',
      planTier: normalizePlanTier(r.plan_tier),
      monthlyRevenueUsd: Number(r.monthly_revenue_usd || 0),
      commissionRate: Number(r.commission_rate || 0.40),
      earnedUsd: Number(r.earned_usd || 0),
      status: r.status || 'active',
      createdAt: Number(r.created_at || now),
    }));

    const totalEarnings = referrals.reduce((sum, r) => sum + r.earnedUsd, 0);

    return {
      userId: cleanUser,
      referralCode: aff?.referral_code || generateReferralCode(cleanUser),
      referralLink: `${baseUrl}/?ref=${aff?.referral_code || generateReferralCode(cleanUser)}`,
      totalReferrals: referrals.length,
      totalEarningsUsd: Math.round(totalEarnings * 100) / 100,
      payoutEmail: aff?.payout_email || null,
      referrals,
    };
  } catch (sqlErr) {
    console.warn('[affiliates] SQLite fallback notice:', sqlErr.message);
  }

  const defaultCode = generateReferralCode(cleanUser);
  return {
    userId: cleanUser,
    referralCode: defaultCode,
    referralLink: `${baseUrl}/?ref=${defaultCode}`,
    totalReferrals: 0,
    totalEarningsUsd: 0.00,
    payoutEmail: null,
    referrals: [],
  };
}

export async function attributeReferralAsync({ referralCode, referredUserId, referredUserEmail, planTier = 'Free Plan' }) {
  if (!referralCode || !referredUserId) return null;
  await ensureAffiliatesTables();

  const cleanCode = String(referralCode).trim().toUpperCase();
  const cleanReferredId = String(referredUserId).trim();
  const cleanEmail = String(referredUserEmail || '').trim();
  const cleanPlan = normalizePlanTier(planTier);
  const now = Date.now();

  const pool = getPgPool();
  let affiliate = null;

  if (pool) {
    try {
      const affRes = await pool.query('SELECT * FROM public.affiliates WHERE referral_code = $1 LIMIT 1', [cleanCode]);
      if (affRes.rows.length > 0) {
        affiliate = affRes.rows[0];
      }
    } catch (e) {
      console.warn('[affiliates] pool check error:', e.message);
    }
  }

  if (!affiliate) {
    try {
      affiliate = db.prepare('SELECT * FROM affiliates WHERE referral_code = ?').get(cleanCode);
    } catch {}
  }

  if (!affiliate) {
    console.warn('[affiliates] Referral code not found:', cleanCode);
    return null;
  }

  // Prevent self-referral
  if (affiliate.user_id === cleanReferredId) {
    console.warn('[affiliates] Cannot self-refer:', cleanReferredId);
    return null;
  }

  const price = PLAN_PRICES[cleanPlan] || 0.00;
  const commissionRate = 0.40;
  const earnedUsd = price * commissionRate;

  // Check if referral already exists (idempotency - don't duplicate on page reload)
  let existing = null;
  if (pool) {
    try {
      const exRes = await pool.query('SELECT * FROM public.referrals WHERE referred_user_id = $1 LIMIT 1', [cleanReferredId]);
      if (exRes.rows.length > 0) existing = exRes.rows[0];
    } catch {}
  }
  if (!existing) {
    try {
      existing = db.prepare('SELECT * FROM referrals WHERE referred_user_id = ?').get(cleanReferredId);
    } catch {}
  }

  if (existing) {
    // If referral exists and plan changed, update plan and earnings difference
    if (existing.plan_tier !== cleanPlan) {
      return await updateReferralPlanAsync({ referredUserId: cleanReferredId, planTier: cleanPlan });
    }
    return existing;
  }

  // Insert new referral
  let inserted = null;
  if (pool) {
    try {
      const insRes = await pool.query(
        `INSERT INTO public.referrals
         (affiliate_user_id, referred_user_id, referred_user_email, plan_tier, monthly_revenue_usd, commission_rate, earned_usd, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $8)
         ON CONFLICT (referred_user_id) DO UPDATE SET
           plan_tier = EXCLUDED.plan_tier,
           monthly_revenue_usd = EXCLUDED.monthly_revenue_usd,
           earned_usd = EXCLUDED.earned_usd,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [affiliate.user_id, cleanReferredId, cleanEmail, cleanPlan, price, commissionRate, earnedUsd, now]
      );
      inserted = insRes.rows[0];

      // Update affiliate totals in Postgres
      await pool.query(
        `UPDATE public.affiliates
         SET total_referrals = total_referrals + 1,
             total_earnings_usd = total_earnings_usd + $1,
             updated_at = $2
         WHERE user_id = $3`,
        [earnedUsd, now, affiliate.user_id]
      );
    } catch (err) {
      console.warn('[affiliates] Postgres attribute error:', err.message);
    }
  }

  // Mirror in SQLite
  try {
    db.prepare(`
      INSERT INTO referrals
      (affiliate_user_id, referred_user_id, referred_user_email, plan_tier, monthly_revenue_usd, commission_rate, earned_usd, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT (referred_user_id) DO UPDATE SET
        plan_tier = excluded.plan_tier,
        monthly_revenue_usd = excluded.monthly_revenue_usd,
        earned_usd = excluded.earned_usd,
        updated_at = excluded.updated_at
    `).run(affiliate.user_id, cleanReferredId, cleanEmail, cleanPlan, price, commissionRate, earnedUsd, now, now);

    db.prepare(`
      UPDATE affiliates
      SET total_referrals = total_referrals + 1,
          total_earnings_usd = total_earnings_usd + ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(earnedUsd, now, affiliate.user_id);
  } catch {}

  return inserted || {
    affiliate_user_id: affiliate.user_id,
    referred_user_id: cleanReferredId,
    referred_user_email: cleanEmail,
    plan_tier: cleanPlan,
    monthly_revenue_usd: price,
    commission_rate: commissionRate,
    earned_usd: earnedUsd,
    status: 'active',
    created_at: now,
  };
}

export async function updateReferralPlanAsync({ referredUserId, planTier }) {
  if (!referredUserId || !planTier) return null;
  await ensureAffiliatesTables();

  const cleanReferredId = String(referredUserId).trim();
  const cleanPlan = normalizePlanTier(planTier);
  const now = Date.now();

  const pool = getPgPool();
  let existing = null;

  if (pool) {
    try {
      const res = await pool.query('SELECT * FROM public.referrals WHERE referred_user_id = $1 LIMIT 1', [cleanReferredId]);
      if (res.rows.length > 0) existing = res.rows[0];
    } catch {}
  }
  if (!existing) {
    try {
      existing = db.prepare('SELECT * FROM referrals WHERE referred_user_id = ?').get(cleanReferredId);
    } catch {}
  }

  if (!existing) {
    return { ok: true, updated: false, reason: 'not_referred' };
  }

  const oldEarned = Number(existing.earned_usd || 0);
  const newPrice = PLAN_PRICES[cleanPlan] || 0.00;
  const commissionRate = 0.40;
  const newEarned = newPrice * commissionRate;
  const diffEarned = newEarned - oldEarned;

  if (pool) {
    try {
      await pool.query(
        `UPDATE public.referrals
         SET plan_tier = $1, monthly_revenue_usd = $2, earned_usd = $3, updated_at = $4
         WHERE referred_user_id = $5`,
        [cleanPlan, newPrice, newEarned, now, cleanReferredId]
      );
      if (diffEarned !== 0) {
        await pool.query(
          `UPDATE public.affiliates
           SET total_earnings_usd = GREATEST(0.00, total_earnings_usd + $1), updated_at = $2
           WHERE user_id = $3`,
          [diffEarned, now, existing.affiliate_user_id]
        );
      }
    } catch (err) {
      console.warn('[affiliates] Postgres updateReferralPlanAsync error:', err.message);
    }
  }

  try {
    db.prepare(`
      UPDATE referrals
      SET plan_tier = ?, monthly_revenue_usd = ?, earned_usd = ?, updated_at = ?
      WHERE referred_user_id = ?
    `).run(cleanPlan, newPrice, newEarned, now, cleanReferredId);

    if (diffEarned !== 0) {
      db.prepare(`
        UPDATE affiliates
        SET total_earnings_usd = MAX(0.0, total_earnings_usd + ?), updated_at = ?
        WHERE user_id = ?
      `).run(diffEarned, now, existing.affiliate_user_id);
    }
  } catch {}

  return { ok: true, updated: true, newPlan: cleanPlan, newEarned, affiliateId: existing.affiliate_user_id };
}

export async function updatePayoutEmailAsync(userId, payoutEmail) {
  if (!userId) return false;
  if (isSpecialAffiliateModeActive(userId)) {
    setSpecialModePayoutEmail(userId, payoutEmail);
    return true;
  }
  await ensureAffiliatesTables();

  const pool = getPgPool();
  if (pool) {
    try {
      await pool.query(
        `UPDATE public.affiliates SET payout_email = $1, updated_at = $2 WHERE user_id = $3`,
        [payoutEmail, Date.now(), userId]
      );
      return true;
    } catch (err) {
      console.warn('[affiliates] updatePayoutEmailAsync error:', err.message);
    }
  }

  try {
    db.prepare('UPDATE affiliates SET payout_email = ?, updated_at = ? WHERE user_id = ?').run(payoutEmail, Date.now(), userId);
    return true;
  } catch {
    return false;
  }
}
