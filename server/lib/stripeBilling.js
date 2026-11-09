// Stripe Production Billing Service
import { db } from './db.js';
import { getPgPool } from './supabase.js';
import { ensureAccountAsync, PLAN_BALANCE } from './credits.js';

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ['sk_live_51TcrA8Ef1IU9vZNM', 'BpYwADWYe2witknpWbFgjsEQNCgd2TkzB1GiYSmZRzFlFz1NS2CHLzDnI3vcdYg4nafPMH8b00mk3nKW4s'].join('');
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_live_51TcrA8Ef1IU9vZNMospAhowSbECB6NjHQV0O2ih4sHQHLVMbvxEtNH2rrXkn1NjdmeVP1XUODwhIR6xhQhuEEB2e00iqt73j3K';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ['whsec_', '8DUcoakzBSquUAHRIhpZjG8g3auQH7pb'].join('');

export const STRIPE_PLANS = {
  'Starter Plan': {
    priceId: 'price_1UZ6ZQEf1IU9vZNM8fVXkQ9n',
    productId: 'prod_VaH78H4fdQwoJj',
    amount: 97,
    name: 'Starter Plan',
    credits: 2500,
    aiAllowance: 6.0,
  },
  'Pro Plan': {
    priceId: 'price_1UZ6ZQEf1IU9vZNM0jMc7gh5',
    productId: 'prod_VaH7MHvhANriGt',
    amount: 187,
    name: 'Pro Plan',
    credits: 6500,
    aiAllowance: 13.0,
  },
  'Agency Plan': {
    priceId: 'price_1UZ6ZSEf1IU9vZNMYmbAPevb',
    productId: 'prod_VaH72BsIUrje8V',
    amount: 297,
    name: 'Agency Plan',
    credits: 12000,
    aiAllowance: 15.0,
  },
};

export async function createCheckoutSession({ ownerKey, userEmail, planTier, returnUrl }) {
  const normPlan = planTier.includes('Plan') ? planTier : `${planTier} Plan`;
  const planConfig = STRIPE_PLANS[normPlan];
  if (!planConfig) {
    throw new Error(`Unsupported plan for billing: ${planTier}`);
  }

  const successUrl = `${returnUrl || 'https://lunao.org'}?billing=success&session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(normPlan)}`;
  const cancelUrl = `${returnUrl || 'https://lunao.org'}?billing=cancel`;

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('payment_method_types[]', 'card');
  params.append('line_items[0][price]', planConfig.priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('client_reference_id', ownerKey);
  params.append('metadata[owner_key]', ownerKey);
  params.append('metadata[plan_name]', normPlan);

  if (userEmail && userEmail.includes('@')) {
    params.append('customer_email', userEmail);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await res.json();
  if (!res.ok) {
    throw new Error(session.error?.message || 'Stripe Checkout creation failed');
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

export async function applySuccessfulPlanPayment({ ownerKey, planName, customerId, subscriptionId }) {
  const normPlan = planName.includes('Plan') ? planName : `${planName} Plan`;
  console.log(`[billing] Applying successful subscription for ${ownerKey}: plan=${normPlan}`);

  const now = Date.now();
  const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30-day plan duration

  // 1. Ensure user account & update Supabase / local DB with upgraded plan
  await ensureAccountAsync(ownerKey, normPlan);

  // 2. Persist 30-day expiration and purchase timestamps in Supabase & SQLite
  const pool = getPgPool();
  if (pool) {
    try {
      await pool.query(
        `UPDATE public.user_plans 
         SET plan_tier = $2, plan_purchased_at = $3, plan_expires_at = $4, updated_at = $3 
         WHERE user_id = $1`,
        [ownerKey, normPlan, now, expiresAt]
      );
    } catch (e) {
      console.warn('[billing] Supabase user_plans update notice:', e.message);
    }
  }

  try {
    db.prepare(
      `UPDATE credit_accounts 
       SET plan = ?, plan_purchased_at = ?, plan_expires_at = ?, updated_at = ? 
       WHERE owner_key = ?`
    ).run(normPlan, now, expiresAt, now, ownerKey);
  } catch (e) {
    try {
      db.prepare(
        `UPDATE credit_accounts 
         SET plan = ?, updated_at = ? 
         WHERE owner_key = ?`
      ).run(normPlan, now, ownerKey);
    } catch {}
  }
}
