import pkg from 'pg';
const { Pool } = pkg;
import { ensureAccountAsync, chargeAsync, getAccountAsync } from '../server/lib/credits.js';
import { getAffiliateProfileAsync, attributeReferralAsync } from '../server/lib/affiliates.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:%24%40Khan1234455@db.wqlbuadknltsjfzrltpe.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function runSmokeTests() {
  console.log('🔥 STARTING SUPABASE END-TO-END SMOKE TESTS...\n');

  const testUserA = `test_affiliate_owner_${Date.now()}`;
  const testUserB = `test_referred_client_${Date.now()}`;

  try {
    // Test 1: Default Tier Seeding
    console.log('1️⃣ Testing Default Tier Seeding for new user...');
    const acctA = await ensureAccountAsync(testUserA, 'Free Plan');
    console.log('   New User Account Seeded:', acctA);
    if (acctA.balance !== 30 || acctA.plan !== 'Free Plan') {
      throw new Error(`Default tier seeding failed! Expected 30 credits, got ${acctA.balance}`);
    }
    console.log('   ✅ Test 1 Passed: Default Free Plan (30 credits) seeded successfully in user_plans & user_credits.\n');

    // Test 2: Credit Deduction & Transaction Logging
    console.log('2️⃣ Testing Credit Deduction (e.g. AI Site Generation / SMS Outreach)...');
    const creditsToCharge = 5;
    const newBal = await chargeAsync(testUserA, creditsToCharge, 'ai_site_generation', 'Rebrand site for Austin Barber');
    console.log(`   Deducted ${creditsToCharge} credits. New Balance: ${newBal}`);

    // Verify in DB directly
    const txRes = await pool.query(
      'SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [testUserA]
    );
    console.log('   Logged Credit Transaction:', txRes.rows[0]);
    if (!txRes.rows[0] || Number(txRes.rows[0].credits_charged) !== creditsToCharge) {
      throw new Error('Credit transaction logging in credit_transactions failed!');
    }
    console.log('   ✅ Test 2 Passed: Credits deducted and logged in credit_transactions.\n');

    // Test 3: Affiliate Referral Profile & Commission Attribution
    console.log('3️⃣ Testing Affiliate Profile & Referral Attribution (40% Commission)...');
    const profileA = await getAffiliateProfileAsync(testUserA);
    console.log('   Affiliate Profile Created:', {
      userId: profileA.userId,
      referralCode: profileA.referralCode,
      referralLink: profileA.referralLink,
    });

    // Seed referred user B on Starter Plan ($97/mo)
    console.log(`   Registering Referred User B (${testUserB}) on Starter Plan ($97/mo) using code ${profileA.referralCode}...`);
    await ensureAccountAsync(testUserB, 'Starter Plan');

    const referral = await attributeReferralAsync({
      referralCode: profileA.referralCode,
      referredUserId: testUserB,
      referredUserEmail: 'starter_client@austin.com',
      planTier: 'Starter Plan',
    });
    console.log('   Referral Attributed:', referral);

    if (Number(referral.earned_usd) !== 38.80) { // 40% of $97 = $38.80
      throw new Error(`Commission calculation mismatch! Expected $38.80, got ${referral.earned_usd}`);
    }

    // Verify updated affiliate totals
    const updatedProfileA = await getAffiliateProfileAsync(testUserA);
    console.log('   Updated Affiliate Profile:', {
      totalReferrals: updatedProfileA.totalReferrals,
      totalEarningsUsd: updatedProfileA.totalEarningsUsd,
    });

    if (updatedProfileA.totalEarningsUsd !== 38.80 || updatedProfileA.totalReferrals < 1) {
      throw new Error('Affiliate totals failed to update in Supabase!');
    }

    console.log('   ✅ Test 3 Passed: 40% Commission ($38.80) attributed correctly to affiliate in referrals and affiliates tables.\n');

    console.log('🎉 ALL SUPABASE SMOKE TESTS PASSED 100% SUCCESSFULLY!');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Smoke Test Failed:', err);
    await pool.end();
    process.exit(1);
  }
}

runSmokeTests();
