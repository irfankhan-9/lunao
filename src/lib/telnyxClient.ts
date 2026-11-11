// Unified Telnyx Client: Cookie & Browser Storage Caching Engine
// Provides instant synchronous loading (0ms cache hydration) and background live syncing.
// Shared across Settings, MessagingSettings, Numbers, and SmsCampaignWizard.

export interface TelnyxNumberItem {
  id: string;
  phoneNumber: string;
  status: string;
  smsCapable: boolean;
  profileId: string | null;
  profileName: string | null;
  canSend: boolean;
  needsMessagingProfile: boolean;
}

export interface CachedTelnyxData {
  connected: boolean;
  apiKey: string;
  account: {
    id: string;
    email: string;
    label: string;
    status: 'active' | 'needs_reconnect' | 'revoked' | 'inactive';
    totalNumbers: number;
  } | null;
  numbers: TelnyxNumberItem[];
  balance: {
    available: string;
    currency: string;
  };
  tokenExpired: boolean;
  lastSyncedAt: number;
}

const CACHE_KEY = 'lunao_telnyx_browser_cache_v3';
const STORAGE_API_KEY = 'lunao_custom_telnyx_api_key';

// Cookie helpers
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// Read cached data synchronously for instant zero-latency UI rendering
export function getCachedTelnyxData(): CachedTelnyxData {
  const fallback: CachedTelnyxData = {
    connected: false,
    apiKey: '',
    account: null,
    numbers: [],
    balance: { available: '0.00', currency: 'USD' },
    tokenExpired: false,
    lastSyncedAt: 0,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const storedApiKey = localStorage.getItem(STORAGE_API_KEY) || getCookie(STORAGE_API_KEY) || '';

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const isExpired = Boolean(
          parsed.tokenExpired ||
          parsed.account?.status === 'needs_reconnect' ||
          parsed.account?.status === 'revoked'
        );
        return {
          connected: !isExpired && Boolean(parsed.connected || storedApiKey || parsed.numbers?.length > 0),
          apiKey: storedApiKey || parsed.apiKey || '',
          account: parsed.account || null,
          numbers: isExpired ? [] : (Array.isArray(parsed.numbers) ? parsed.numbers : []),
          balance: parsed.balance || { available: '0.00', currency: 'USD' },
          tokenExpired: isExpired,
          lastSyncedAt: Number(parsed.lastSyncedAt) || 0,
        };
      }
    }

    if (storedApiKey) {
      fallback.connected = true;
      fallback.apiKey = storedApiKey;
    }
  } catch {
    // Ignore storage parse errors
  }

  return fallback;
}

// Persist fresh Telnyx data to both cookies and browser localStorage
export function saveCachedTelnyxData(data: Partial<CachedTelnyxData>) {
  if (typeof window === 'undefined') return;

  const current = getCachedTelnyxData();
  const updated: CachedTelnyxData = {
    ...current,
    ...data,
    lastSyncedAt: Date.now(),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
    if (updated.apiKey) {
      localStorage.setItem(STORAGE_API_KEY, updated.apiKey);
      setCookie(STORAGE_API_KEY, updated.apiKey, 365);
    }
    if (updated.connected) {
      setCookie('lunao_telnyx_connected', '1', 365);
      if (updated.account?.id) {
        setCookie('lunao_telnyx_account_id', updated.account.id, 365);
      }
    }
  } catch {
    // Storage quota non-fatal
  }

  try {
    window.dispatchEvent(new CustomEvent('lunao:telnyx_sync', { detail: updated }));
  } catch {
    // Event dispatch non-fatal
  }

  return updated;
}

// Live background synchronizer ("catch data from its real account")
// Smoothly fetches live numbers, balance, and account state without blocking the UI.
export async function syncTelnyxAccountLive(ownerKey: string): Promise<CachedTelnyxData> {
  const current = getCachedTelnyxData();
  const keyToUse = (current.apiKey || localStorage.getItem(STORAGE_API_KEY) || getCookie(STORAGE_API_KEY) || '').trim();

  let tokenExpired = false;
  let numbers: TelnyxNumberItem[] = [];
  let account = current.account;
  let balance = current.balance || { available: '0.00', currency: 'USD' };
  let isConnected = false;

  try {
    // 1. If we have an API Key, verify and fetch live numbers directly
    if (keyToUse) {
      const res = await fetch('/api/telnyx/query-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToUse, ownerKey }),
      });

      if (res.status === 401 || res.status === 403 || !res.ok) {
        tokenExpired = true;
        isConnected = false;
        numbers = [];
        account = {
          id: 'api_key_account',
          email: 'Telnyx Authenticated Carrier',
          label: 'Telnyx API Key Line',
          status: 'needs_reconnect',
          totalNumbers: 0,
        };
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.ok && Array.isArray(data.numbers)) {
          numbers = data.numbers.map((n: any) => ({
            id: String(n.id || n.phoneNumber || n.number),
            phoneNumber: String(n.phoneNumber || n.number),
            status: n.status || 'active',
            smsCapable: n.smsCapable !== false,
            profileId: n.profileId || null,
            profileName: n.profileName || null,
            canSend: Boolean(n.canSend),
            needsMessagingProfile: Boolean(n.needsMessagingProfile),
          }));
          isConnected = true;
          tokenExpired = false;
          account = {
            id: 'api_key_account',
            email: 'Telnyx Authenticated Carrier',
            label: 'Telnyx API Key Line',
            status: 'active',
            totalNumbers: numbers.length,
          };
        } else {
          tokenExpired = true;
          isConnected = false;
          numbers = [];
        }
      }
    }

    // 2. Query server-side accounts & stats (works for both OAuth & API key)
    const [accRes, statsRes] = await Promise.all([
      fetch(`/api/telnyx/accounts?ownerKey=${encodeURIComponent(ownerKey)}`, { credentials: 'include' })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/messaging/stats?ownerKey=${encodeURIComponent(ownerKey)}`, { credentials: 'include' })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (accRes?.ok && Array.isArray(accRes.accounts) && accRes.accounts.length > 0) {
      const liveAcc = accRes.accounts[0];
      if (liveAcc.status === 'needs_reconnect' || liveAcc.status === 'revoked') {
        tokenExpired = true;
        isConnected = false;
        numbers = [];
        account = {
          id: liveAcc.id,
          email: liveAcc.account_email || 'Telnyx Account',
          label: liveAcc.account_label || liveAcc.account_email || 'Telnyx Account',
          status: 'needs_reconnect',
          totalNumbers: 0,
        };
      } else {
        // Query live numbers with capability check
        const numRes = await fetch(
          `/api/telnyx/accounts/${encodeURIComponent(liveAcc.id)}/numbers-with-status?ownerKey=${encodeURIComponent(ownerKey)}`,
          { credentials: 'include' }
        );

        if (numRes.status === 401 || numRes.status === 403) {
          tokenExpired = true;
          isConnected = false;
          numbers = [];
          account = {
            id: liveAcc.id,
            email: liveAcc.account_email || 'Telnyx Account',
            label: liveAcc.account_label || liveAcc.account_email || 'Telnyx Account',
            status: 'needs_reconnect',
            totalNumbers: 0,
          };
        } else if (numRes.ok) {
          const numData = await numRes.json().catch(() => ({}));
          const list = Array.isArray(numData) ? numData : (Array.isArray(numData?.numbers) ? numData.numbers : []);
          numbers = list.map((n: any) => ({
            id: String(n.id || n.phoneNumber || n.number),
            phoneNumber: String(n.phoneNumber || n.number),
            status: n.status || 'active',
            smsCapable: n.smsCapable !== false,
            profileId: n.profileId || null,
            profileName: n.profileName || null,
            canSend: Boolean(n.canSend),
            needsMessagingProfile: Boolean(n.needsMessagingProfile),
          }));
          isConnected = true;
          tokenExpired = false;
          account = {
            id: liveAcc.id,
            email: liveAcc.account_email || 'Telnyx Account',
            label: liveAcc.account_label || liveAcc.account_email || 'Telnyx Account',
            status: 'active',
            totalNumbers: numbers.length,
          };
        }
      }
    } else if (!keyToUse) {
      // Neither API key nor OAuth account connected
      isConnected = false;
      tokenExpired = false;
      numbers = [];
      account = null;
    }

    if (statsRes?.balance) {
      balance = {
        available: String(statsRes.balance.available || balance.available),
        currency: String(statsRes.balance.currency || balance.currency),
      };
    }
  } catch (err: any) {
    console.warn('[Telnyx Live Sync Notice]', err?.message);
  }

  if (tokenExpired) {
    numbers = [];
    isConnected = false;
  }

  return saveCachedTelnyxData({
    connected: isConnected && !tokenExpired,
    apiKey: keyToUse,
    account,
    numbers,
    balance,
    tokenExpired,
  })!;
}

// Disconnect Telnyx and purge all cached tokens and cookies
export async function clearTelnyxAuth(ownerKey: string) {
  try {
    deleteCookie(STORAGE_API_KEY);
    deleteCookie('lunao_telnyx_connected');
    deleteCookie('lunao_telnyx_account_id');
    localStorage.removeItem(STORAGE_API_KEY);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('lunao_sender_number');

    const cached = getCachedTelnyxData();
    if (cached.account?.id && cached.account.id !== 'api_key_account') {
      await fetch(`/api/telnyx/accounts/${encodeURIComponent(cached.account.id)}?ownerKey=${encodeURIComponent(ownerKey)}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {});
    }
  } catch {
    // Non-fatal
  }

  saveCachedTelnyxData({
    connected: false,
    apiKey: '',
    account: null,
    numbers: [],
    tokenExpired: false,
  });
}
