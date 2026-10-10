// Owner PWA authentication.
//
// Authenticates the owner against the real Lunao backend at /api/owner/redeem.
// On success, the server returns { token, slug, businessName, niche, siteUrl }
// and we immediately fetch /api/pwa/me to hydrate the full business profile.
//
// The token + slug + business are stored in localStorage so a page reload
// restores the session without re-prompting for the code.
import { TenantBusiness } from '../types';

const SESSION_KEY = 'lunao_owner_session';

export interface OwnerSession {
  token: string;
  slug: string;
  code: string;
  business: TenantBusiness;
  authenticatedAt: string;
}

export interface AuthResult {
  success: boolean;
  business?: TenantBusiness;
  token?: string;
  slug?: string;
  errorMessage?: string;
}

function persistSession(session: OwnerSession | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function readSession(): OwnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as OwnerSession) : null;
  } catch {
    return null;
  }
}

async function fetchFullBusiness(token: string, slug: string, fallbackName?: string): Promise<TenantBusiness> {
  const res = await fetch('/api/pwa/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Graceful degradation — return a minimal profile so the UI can render.
    return {
      id: slug,
      lunaoCode: '',
      slug,
      authToken: token,
      name: fallbackName || slug,
      niche: 'Local Business',
      tagline: '',
      logoUrl: null,
      phone: '',
      email: '',
      address: '',
      city: '',
      timezone: '',
      websiteUrl: '',
      socialLinks: {},
      theme: {
        accent: '#059669',
        accentDark: '#047857',
        accentSoft: '#ecfdf5',
        accentBorder: '#a7f3d0',
        surface: '#ffffff',
        radius: 'lg',
      },
      features: { booking: true, chatbot: true, email: true, automations: true },
      aiSettings: {
        enabled: true,
        greeting: '',
        tone: 'friendly',
        businessDescription: '',
        businessHours: '',
        locationDetails: '',
        faqs: [],
        policies: '',
        bookingEnabled: true,
        bookingInstructions: '',
        infoToCollect: [],
        confirmationBehavior: '',
        doNotClaim: '',
        escalationGuidance: '',
      },
      websiteConfig: {
        url: '',
        status: 'draft',
        lastUpdated: null,
        lastDeployed: null,
        headline: '',
        subheadline: '',
        heroImage: '',
        ctaText: '',
        announcement: '',
      },
    };
  }
  const data = await res.json();
  const b = data.business || {};
  return {
    id: b.slug || slug,
    lunaoCode: '',
    slug: b.slug || slug,
    authToken: token,
    name: b.name || fallbackName || slug,
    niche: b.niche || 'Local Business',
    tagline: b.tagline || '',
    logoUrl: b.logoUrl || null,
    phone: b.phone || '',
    email: b.email || '',
    address: b.address || '',
    city: b.city || '',
    timezone: b.timezone || '',
    websiteUrl: b.websiteUrl || '',
    socialLinks: b.socialLinks || {},
    theme: {
      accent: b.theme?.accent || '#059669',
      accentDark: b.theme?.accentDark || '#047857',
      accentSoft: b.theme?.accentSoft || '#ecfdf5',
      accentBorder: b.theme?.accentBorder || '#a7f3d0',
      surface: b.theme?.surface || '#ffffff',
      radius: b.theme?.radius || 'lg',
    },
    features: {
      booking: !!b.features?.booking,
      chatbot: !!b.features?.chatbot,
      email: !!b.features?.email,
      automations: !!b.features?.automations,
    },
    aiSettings: {
      enabled: !!data.aiSettings?.enabled,
      greeting: data.aiSettings?.greeting || '',
      tone: data.aiSettings?.tone || 'friendly',
      businessDescription: data.aiSettings?.businessDescription || '',
      businessHours: data.aiSettings?.businessHours || '',
      locationDetails: data.aiSettings?.locationDetails || '',
      faqs: data.aiSettings?.faqs || [],
      policies: data.aiSettings?.policies || '',
      bookingEnabled: !!data.aiSettings?.bookingEnabled,
      bookingInstructions: data.aiSettings?.bookingInstructions || '',
      infoToCollect: data.aiSettings?.infoToCollect || [],
      confirmationBehavior: data.aiSettings?.confirmationBehavior || '',
      doNotClaim: data.aiSettings?.doNotClaim || '',
      escalationGuidance: data.aiSettings?.escalationGuidance || '',
    },
    websiteConfig: {
      url: data.website?.url || '',
      status: data.website?.status || 'draft',
      lastUpdated: data.website?.lastUpdated || null,
      lastDeployed: data.website?.lastDeployed || null,
      headline: data.website?.headline || '',
      subheadline: data.website?.subheadline || '',
      heroImage: data.website?.heroImage || '',
      ctaText: data.website?.ctaText || '',
      announcement: data.website?.announcement || '',
    },
  };
}

export const tenantAuthService = {
  /**
   * Validate a Lunao owner code against the backend. On success, persist
   * {token, slug, business} in localStorage and return it.
   */
  async authenticateCode(inputCode: string): Promise<AuthResult> {
    const normalized = String(inputCode || '').trim().toUpperCase();
    if (!normalized) {
      return { success: false, errorMessage: 'Please enter your unique owner access code.' };
    }
    if (!/^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
      return {
        success: false,
        errorMessage: 'Invalid code format. Codes look like LUNAO-XXXX-XXXX.',
      };
    }

    let resp;
    try {
      resp = await fetch('/api/owner/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized, deviceLabel: 'pwa', platform: 'web' }),
      });
    } catch (err: any) {
      return {
        success: false,
        errorMessage: `Could not reach the Lunao server. ${err?.message || ''}`.trim(),
      };
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.token) {
      return {
        success: false,
        errorMessage: data?.error || 'Invalid or revoked invite code.',
      };
    }

    const business = await fetchFullBusiness(data.token, data.slug, data.businessName);
    business.lunaoCode = normalized;
    business.authToken = data.token;
    business.slug = data.slug;

    persistSession({
      token: data.token,
      slug: data.slug,
      code: normalized,
      business,
      authenticatedAt: new Date().toISOString(),
    });

    return { success: true, business, token: data.token, slug: data.slug };
  },

  /** Read the persisted session without re-authenticating. */
  async getStoredSession(): Promise<OwnerSession | null> {
    const stored = readSession();
    if (!stored?.token || !stored?.slug) return null;
    // Best-effort: refresh the business profile in the background.
    try {
      const fresh = await fetchFullBusiness(stored.token, stored.slug, stored.business?.name);
      fresh.lunaoCode = stored.code;
      fresh.authToken = stored.token;
      fresh.slug = stored.slug;
      const updated: OwnerSession = { ...stored, business: fresh };
      persistSession(updated);
      return updated;
    } catch {
      return stored;
    }
  },

  /** Legacy compat — returns just the code, or null. */
  getStoredCode(): string | null {
    const stored = readSession();
    return stored?.code || null;
  },

  /** Returns the bearer token for outbound API calls. */
  getAuthToken(): string | null {
    return readSession()?.token || null;
  },

  /** Returns the slug for outbound API calls. */
  getActiveSlug(): string | null {
    return readSession()?.slug || null;
  },

  /** Clears the local session. */
  logout(): void {
    persistSession(null);
  },

  /**
   * Legacy compat — the demo profile quick-pick was removed in v2.
   * Returns an empty array; UI should not surface demo profiles anymore.
   */
  getAvailableDemoProfiles(): { code: string; name: string; niche: string; city: string }[] {
    return [];
  },
};
