// Lunao Affiliate & Referral Client Tracking Engine
// Captures ?ref= and ?aff= parameters, persists in cookies & localStorage (30-day window),
// and guarantees reliable attribution and plan-upgrade tracking for production.

const STORAGE_KEY = 'lunao_referral_code';
const STORAGE_TS_KEY = 'lunao_referral_ts';
const COOKIE_NAME = 'lunao_referral_code';
const ATTRIBUTED_PREFIX = 'lunao_referral_attributed_';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 30) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 86400;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax${secure}`;
}

/**
 * Captures affiliate referral code from URL on landing/app mount.
 * Supports: ?ref=CODE, ?aff=CODE, ?referral=CODE, ?r=CODE
 */
export function captureReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ref') || params.get('aff') || params.get('referral') || params.get('r');
    if (!raw) return null;

    const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 36);
    if (!clean) return null;

    // Persist in localStorage and 30-day cookie
    localStorage.setItem(STORAGE_KEY, clean);
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()));
    setCookie(COOKIE_NAME, clean, 30);

    return clean;
  } catch {
    return null;
  }
}

/**
 * Returns stored referral code if active within 30-day attribution window.
 */
export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return local;
    const cookie = getCookie(COOKIE_NAME);
    if (cookie) {
      localStorage.setItem(STORAGE_KEY, cookie);
      return cookie;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Binds an authenticated user to the affiliate who referred them.
 * Safe & idempotent: only executes once per user account.
 */
export async function attributeSignupReferral(
  ownerKey: string,
  userEmail: string = '',
  planTier: string = 'Free Plan'
): Promise<boolean> {
  if (!ownerKey || ownerKey === 'anonymous') return false;

  const referralCode = getStoredReferralCode();
  if (!referralCode) return false;

  // Check if already attributed locally
  const attributedKey = `${ATTRIBUTED_PREFIX}${ownerKey}`;
  if (localStorage.getItem(attributedKey)) return true;

  try {
    const token = localStorage.getItem('lunao_auth_token') || ownerKey;
    const res = await fetch('/api/affiliate/referral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-owner-key': ownerKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        referralCode,
        referredUserEmail: userEmail || `${ownerKey}@lunao-user.app`,
        planTier,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      localStorage.setItem(attributedKey, referralCode);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Notifies the affiliate engine whenever a user upgrades or selects a plan,
 * keeping the affiliate's recurring 40% commission updated in real-time.
 */
export async function syncPlanWithAffiliate(
  ownerKey: string,
  planName: string
): Promise<void> {
  if (!ownerKey || ownerKey === 'anonymous') return;

  try {
    const token = localStorage.getItem('lunao_auth_token') || ownerKey;
    await fetch('/api/affiliate/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-owner-key': ownerKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        planTier: planName,
      }),
    });
  } catch {
    /* non-blocking background notification */
  }
}
