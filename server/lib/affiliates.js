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
};

function generateReferralCode(userId) {
  const clean = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(-6) || Math.random().toString(36).slice(2, 8).toUpperCase();
  const extra = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LUNAO-${suffix}-${extra}`;
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
    referralLink: 'https://lunao.app/signup?ref=LUNAO-VIP-PARTNER',
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

  const pool = getPgPool();
  const now = Date.now();

  if (pool) {
    try {
      // 1. Fetch or create affiliate profile
      let affRes = await pool.query('SELECT * FROM affiliates WHERE user_id = $1 LIMIT 1', [userId]);
      if (affRes.rows.length === 0) {
        const refCode = generateReferralCode(userId);
        await pool.query(
          `INSERT INTO affiliates (user_id, referral_code, total_referrals, total_earnings_usd, created_at)
           VALUES ($1, $2, 0, 0.00, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, refCode, now]
        );
        affRes = await pool.query('SELECT * FROM affiliates WHERE user_id = $1 LIMIT 1', [userId]);
      }

      const aff = affRes.rows[0];

      // 2. Fetch all referrals for this affiliate
      const refRes = await pool.query(
        'SELECT * FROM referrals WHERE affiliate_user_id = $1 ORDER BY created_at DESC',
        [userId]
      );

      const referrals = refRes.rows.map((r) => ({
        id: r.id,
        referredUserId: r.referred_user_id,
        referredUserEmail: r.referred_user_email || 'Referred Client',
        planTier: r.plan_tier || 'Free Plan',
        monthlyRevenueUsd: Number(r.monthly_revenue_usd || 0),
        commissionRate: Number(r.commission_rate || 0.40),
        earnedUsd: Number(r.earned_usd || 0),
        status: r.status || 'active',
        createdAt: Number(r.created_at || now),
      }));

      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : 'https://lunao.app';

      return {
        userId: aff.user_id,
        referralCode: aff.referral_code,
        referralLink: `${baseUrl}/signup?ref=${aff.referral_code}`,
        totalReferrals: Number(aff.total_referrals || referrals.length),
        totalEarningsUsd: Number(aff.total_earnings_usd || 0),
        payoutEmail: aff.payout_email || null,
        referrals,
      };
    } catch (err) {
      console.warn('[affiliates] getAffiliateProfileAsync error:', err.message);
    }
  }

  // SQLite fallback
  const refCode = generateReferralCode(userId);
  return {
    userId,
    referralCode: refCode,
    referralLink: `https://lunao.app/signup?ref=${refCode}`,
    totalReferrals: 0,
    totalEarningsUsd: 0.00,
    payoutEmail: null,
    referrals: [],
  };
}

export async function attributeReferralAsync({ referralCode, referredUserId, referredUserEmail, planTier = 'Free Plan' }) {
  if (!referralCode || !referredUserId) return null;
  const pool = getPgPool();
  if (!pool) return null;

  try {
    const cleanCode = String(referralCode).trim().toUpperCase();
    const affRes = await pool.query('SELECT * FROM affiliates WHERE referral_code = $1 LIMIT 1', [cleanCode]);

    if (affRes.rows.length === 0) {
      console.warn('[affiliates] Referral code not found:', cleanCode);
      return null;
    }

    const affiliate = affRes.rows[0];
    if (affiliate.user_id === referredUserId) {
      console.warn('[affiliates] Cannot self-refer:', referredUserId);
      return null;
    }

    const price = PLAN_PRICES[planTier] || 0.00;
    const commissionRate = 0.40;
    const earnedUsd = price * commissionRate;
    const now = Date.now();

    // Insert referral record
    const refIns = await pool.query(
      `INSERT INTO referrals (affiliate_user_id, referred_user_id, referred_user_email, plan_tier, monthly_revenue_usd, commission_rate, earned_usd, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING *`,
      [affiliate.user_id, referredUserId, referredUserEmail || '', planTier, price, commissionRate, earnedUsd, now]
    );

    // Update affiliate total stats
    await pool.query(
      `UPDATE affiliates
       SET total_referrals = total_referrals + 1,
           total_earnings_usd = total_earnings_usd + $1
       WHERE user_id = $2`,
      [earnedUsd, affiliate.user_id]
    );

    return refIns.rows[0];
  } catch (err) {
    console.warn('[affiliates] attributeReferralAsync error:', err.message);
    return null;
  }
}

export async function updatePayoutEmailAsync(userId, payoutEmail) {
  if (!userId) return false;
  if (isSpecialAffiliateModeActive(userId)) {
    setSpecialModePayoutEmail(userId, payoutEmail);
    return true;
  }
  const pool = getPgPool();
  if (!pool) return false;
  try {
    await pool.query(
      `UPDATE affiliates SET payout_email = $1 WHERE user_id = $2`,
      [payoutEmail, userId]
    );
    return true;
  } catch (err) {
    console.warn('[affiliates] updatePayoutEmailAsync error:', err.message);
    return false;
  }
}

