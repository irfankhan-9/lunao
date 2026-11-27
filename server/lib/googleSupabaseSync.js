// Syncs Google GIS logins/signups into Supabase Auth (auth.users) and provisions
// public.user_plans / public.user_credits / public.credit_accounts via Supabase REST
// while preserving existing ownerKey (user_<google_uid>) and Google Cloud OAuth branding.
import { supabase as supabaseCfg } from './config.js';

function getSbCreds() {
  const sbUrl = process.env.SUPABASE_URL || supabaseCfg?.url || 'https://wqlbuadknltsjfzrltpe.supabase.co';
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseCfg?.secretKey || '';
  return { sbUrl, sbKey };
}

function encodeActionBalance15(rawBalance, nowMs = Date.now()) {
  const safe = Math.max(0, Math.round(Number(rawBalance || 0) * 10) / 10);
  const intPart = Math.floor(safe);
  const tenthPart = Math.round((safe - intPart) * 10);
  const updatedAt = Math.floor(nowMs / 1000) * 1000 + 700 + Math.min(9, Math.max(0, tenthPart));
  return { action_credits_balance: intPart, updated_at: updatedAt, exactBalance: safe };
}

function decodeActionBalance(row, fallback = 15) {
  if (!row || row.action_credits_balance === null || row.action_credits_balance === undefined) return fallback;
  const intPart = Number(row.action_credits_balance);
  if (!Number.isFinite(intPart)) return fallback;
  const tail = Number(row.updated_at || 0) % 1000;
  if (tail >= 700 && tail <= 709 && Number.isInteger(intPart)) {
    return Math.round((intPart + (tail - 700) / 10) * 10) / 10;
  }
  return Math.round(intPart * 10) / 10;
}

/**
 * Ensures the Google user exists inside Supabase Authentication -> Users (auth.users).
 * Never throws; returns { ok, created, authUserId }.
 */
export async function mirrorUserToSupabaseAuth({ ownerKey, uid, email, name, picture }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, reason: 'no_email' };
  }
  const { sbUrl, sbKey } = getSbCreds();
  if (!sbUrl || !sbKey) {
    return { ok: false, reason: 'missing_supabase_credentials' };
  }

  const cleanUid = String(uid || cleanEmail).trim();
  const displayName = String(name || cleanEmail.split('@')[0] || 'Lunao User').trim();
  const avatarUrl = String(picture || '').trim();
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  const userMetadata = {
    full_name: displayName,
    name: displayName,
    email: cleanEmail,
    email_verified: true,
    avatar_url: avatarUrl,
    picture: avatarUrl,
    sub: cleanUid,
    provider_id: cleanUid,
    owner_key: ownerKey,
  };

  try {
    // 1. Try creating user directly in Supabase Auth
    const createRes = await fetch(`${sbUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: { provider: 'google', providers: ['google'] },
      }),
      signal: AbortSignal.timeout(4500),
    });

    if (createRes.ok) {
      const created = await createRes.json().catch(() => ({}));
      return { ok: true, created: true, authUserId: created?.id || created?.user?.id || null };
    }

    // 2. If user already exists in auth.users, find them and ensure metadata (sub / owner_key / name) is attached
    const listRes = await fetch(`${sbUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers,
      signal: AbortSignal.timeout(4500),
    });
    if (listRes.ok) {
      const listData = await listRes.json().catch(() => ({}));
      const users = Array.isArray(listData?.users) ? listData.users : [];
      const existing = users.find((u) => String(u?.email || '').trim().toLowerCase() === cleanEmail);
      if (existing?.id) {
        const mergedMeta = {
          ...(existing.user_metadata || {}),
          ...userMetadata,
          // Keep non-empty existing avatar/name if incoming was empty
          avatar_url: avatarUrl || existing.user_metadata?.avatar_url || '',
          picture: avatarUrl || existing.user_metadata?.picture || '',
        };
        await fetch(`${sbUrl}/auth/v1/admin/users/${encodeURIComponent(existing.id)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ user_metadata: mergedMeta }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => {});
        return { ok: true, created: false, authUserId: existing.id };
      }
    }

    const errTxt = await createRes.text().catch(() => '');
    console.warn('[auth/supabase-mirror] Supabase Auth mirror notice:', createRes.status, errTxt.slice(0, 160));
    return { ok: false, reason: `http_${createRes.status}` };
  } catch (err) {
    console.warn('[auth/supabase-mirror] Supabase Auth mirror warning:', err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * Provisions or loads user_plans, user_credits, and credit_accounts via Supabase REST
 * (used when Postgres Pool is absent or fails) and ensures email is saved on user_plans.
 */
export async function syncGoogleUserTablesViaRest({ ownerKey, email }) {
  const { sbUrl, sbKey } = getSbCreds();
  if (!sbUrl || !sbKey || !ownerKey) {
    return null;
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const enc = encodeURIComponent(ownerKey);
  const now = Date.now();
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const [planRes, credRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/user_plans?user_id=eq.${enc}&select=*&limit=1`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`${sbUrl}/rest/v1/user_credits?user_id=eq.${enc}&select=*&limit=1`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }),
    ]);

    const planRows = planRes.ok ? await planRes.json().catch(() => []) : [];
    const credRows = credRes.ok ? await credRes.json().catch(() => []) : [];
    let pRow = Array.isArray(planRows) && planRows[0] ? planRows[0] : null;
    let cRow = Array.isArray(credRows) && credRows[0] ? credRows[0] : null;
    let isNewUser = false;

    if (!pRow) {
      isNewUser = true;
      const planBody = {
        user_id: ownerKey,
        plan_tier: 'Free Plan',
        monthly_action_credits: 15,
        monthly_ai_credits: 0,
        monthly_ai_allowance_usd: 0,
        ai_credits_balance: 0,
        pwa_business_limit: 1,
        updated_at: now,
        ...(cleanEmail ? { email: cleanEmail } : {}),
      };
      const createPlanRes = await fetch(`${sbUrl}/rest/v1/user_plans`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(planBody),
        signal: AbortSignal.timeout(4000),
      });
      if (createPlanRes.ok) {
        const created = await createPlanRes.json().catch(() => []);
        if (Array.isArray(created) && created[0]) pRow = created[0];
      }
      if (!pRow) pRow = planBody;
    } else if (cleanEmail && !pRow.email) {
      await fetch(`${sbUrl}/rest/v1/user_plans?user_id=eq.${enc}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ email: cleanEmail }),
        signal: AbortSignal.timeout(3500),
      }).catch(() => {});
    }

    if (!cRow) {
      isNewUser = true;
      const encoded = encodeActionBalance15(15, now);
      const credBody = {
        user_id: ownerKey,
        action_credits_balance: encoded.action_credits_balance,
        ai_credits_balance: 0,
        ai_dollars_spent: 0,
        updated_at: encoded.updated_at,
      };
      const createCredRes = await fetch(`${sbUrl}/rest/v1/user_credits`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(credBody),
        signal: AbortSignal.timeout(4000),
      });
      if (createCredRes.ok) {
        const created = await createCredRes.json().catch(() => []);
        if (Array.isArray(created) && created[0]) cRow = created[0];
      }
      if (!cRow) cRow = credBody;

      // Record initial allocation in credit_transactions (best-effort)
      fetch(`${sbUrl}/rest/v1/credit_transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: ownerKey,
          action_type: 'plan_topup',
          credits_charged: 15,
          description: 'Initial Free Plan balance allocation',
          created_at: now,
        }),
        signal: AbortSignal.timeout(3500),
      }).catch(() => {});
    }

    // Ensure credit_accounts row exists without overwriting existing balances/plans
    fetch(`${sbUrl}/rest/v1/credit_accounts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        owner_key: ownerKey,
        plan: pRow?.plan_tier || 'Free Plan',
        balance: Math.round(decodeActionBalance(cRow, 15)),
        updated_at: Math.floor(now / 1000),
        created_at: Math.floor(now / 1000),
      }),
      signal: AbortSignal.timeout(3500),
    }).catch(() => {});

    const plan = pRow?.plan_tier || 'Free Plan';
    const userCredits = decodeActionBalance(cRow, 15);
    const vibeCredits = plan === 'Free Plan'
      ? 0
      : Number(cRow?.ai_credits_balance ?? pRow?.ai_credits_balance ?? 0);

    return { isNewUser, plan, userCredits, vibeCredits };
  } catch (err) {
    console.warn('[auth/google-session] REST sync warning:', err.message);
    return null;
  }
}
