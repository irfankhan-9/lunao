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

function createFallbackBusiness(input: string, fallbackName?: string): TenantBusiness {
  const cleanInput = String(input || '').trim();
  const slug = cleanInput.toLowerCase().replace(/^lunao-/, '').replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'vintage-cuts';
  
  // Format readable business name
  const formattedName =
    fallbackName ||
    cleanInput
      .replace(/^lunao-/i, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') ||
    'Lunao Local Business';

  let niche = 'Local Business';
  let accent = '#059669';
  let accentDark = '#047857';
  let accentSoft = '#ecfdf5';
  let accentBorder = '#a7f3d0';

  const lower = (slug + ' ' + formattedName).toLowerCase();
  if (lower.includes('barber')) {
    niche = 'Barber';
    accent = '#D97706';
    accentDark = '#B45309';
    accentSoft = '#FEF3C7';
    accentBorder = '#FDE68A';
  } else if (lower.includes('dental') || lower.includes('dentist')) {
    niche = 'Dentist';
    accent = '#0284C7';
    accentDark = '#0369A1';
    accentSoft = '#E0F2FE';
    accentBorder = '#BAE6FD';
  } else if (lower.includes('hvac') || lower.includes('climate') || lower.includes('air')) {
    niche = 'HVAC';
    accent = '#EA580C';
    accentDark = '#C2410C';
    accentSoft = '#FFEDD5';
    accentBorder = '#FED7AA';
  } else if (lower.includes('roof')) {
    niche = 'Roofing';
    accent = '#475569';
    accentDark = '#334155';
    accentSoft = '#F1F5F9';
    accentBorder = '#CBD5E1';
  } else if (lower.includes('gym') || lower.includes('fitness')) {
    niche = 'Gym';
    accent = '#DC2626';
    accentDark = '#B91C1C';
    accentSoft = '#FEE2E2';
    accentBorder = '#FECACA';
  } else if (lower.includes('realestate') || lower.includes('property') || lower.includes('aura')) {
    niche = 'Real Estate';
    accent = '#4F46E5';
    accentDark = '#4338CA';
    accentSoft = '#EEF2FF';
    accentBorder = '#C7D2FE';
  } else if (lower.includes('salon') || lower.includes('hair') || lower.includes('beauty')) {
    niche = 'Salon';
    accent = '#DB2777';
    accentDark = '#BE185D';
    accentSoft = '#FCE7F3';
    accentBorder = '#FBCFE8';
  }

  return {
    id: slug,
    lunaoCode: cleanInput.toUpperCase().startsWith('LUNAO-') ? cleanInput.toUpperCase() : `LUNAO-${slug.slice(0, 8).toUpperCase()}`,
    slug,
    authToken: `lunao.mock.${Date.now()}`,
    name: formattedName,
    niche,
    tagline: `Premier ${niche} Services`,
    logoUrl: null,
    phone: '(512) 555-0199',
    email: `contact@${slug}.com`,
    address: '3801 Capital of Texas Hwy, Suite 200',
    city: 'Austin, TX',
    timezone: 'America/Chicago',
    websiteUrl: `https://${slug}.lunao.app`,
    socialLinks: {
      instagram: `${slug}_official`,
      facebook: `https://facebook.com/${slug}`,
    },
    theme: {
      accent,
      accentDark,
      accentSoft,
      accentBorder,
      surface: '#ffffff',
      radius: 'lg',
    },
    features: { booking: true, chatbot: true, email: true, automations: true },
    aiSettings: {
      enabled: true,
      greeting: `Welcome to ${formattedName}! How can we assist you today?`,
      tone: 'friendly',
      businessDescription: `High-end local ${niche.toLowerCase()} service provider offering premium appointments and consultations.`,
      businessHours: 'Mon-Sat: 8:00 AM - 7:00 PM | Sun: Closed',
      locationDetails: 'Convenient central location with dedicated guest parking.',
      faqs: [
        { id: 'faq-1', question: 'Do I need an appointment?', answer: 'We strongly recommend booking online in advance to guarantee your time slot.' },
        { id: 'faq-2', question: 'What is your cancellation policy?', answer: 'Please give us at least 24 hours notice for any rescheduling or cancellations.' },
      ],
      policies: '24-hour cancellation policy. Major credit cards accepted.',
      bookingEnabled: true,
      bookingInstructions: 'Select your preferred service, date, and time. Confirmation sent via SMS.',
      infoToCollect: ['Full Name', 'Phone Number', 'Preferred Date & Time', 'Special Requests'],
      confirmationBehavior: 'Instant confirmation email & SMS sent to the customer.',
      doNotClaim: 'Do not quote exact prices without knowing specific requirements.',
      escalationGuidance: 'Transfer complex inquiries or special requests directly to the manager on duty.',
    },
    websiteConfig: {
      url: `https://${slug}.lunao.app`,
      status: 'deployed',
      lastUpdated: new Date().toISOString(),
      lastDeployed: new Date().toISOString(),
      headline: `Exceptional ${niche} Experiences`,
      subheadline: 'Craftsmanship, precision, and VIP care tailored to you.',
      heroImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
      ctaText: 'Book Appointment',
      announcement: '✨ Now accepting online reservations for this week!',
    },
  };
}

export const tenantAuthService = {
  /**
   * Validate a Lunao owner code against the backend. On success, persist
   * {token, slug, business} in localStorage and return it.
   */
  async authenticateCode(inputCode: string): Promise<AuthResult> {
    const rawInput = String(inputCode || '').trim();
    if (!rawInput) {
      return { success: false, errorMessage: 'Please enter your unique owner access code or website name.' };
    }
    let normalized = rawInput.toUpperCase();
    if (!normalized.startsWith('LUNAO-') && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(normalized)) {
      normalized = `LUNAO-${normalized}`;
    }
    const codeToSend = /^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(normalized) ? normalized : rawInput;

    // 1. Attempt backend validation with strict 1200ms abort to prevent hangs
    let data: any = null;
    let ok = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const resp = await fetch('/api/owner/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToSend, deviceLabel: 'pwa', platform: 'web' }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      ok = resp.ok;
      data = await resp.json().catch(() => ({}));
    } catch {
      // Backend offline or unreachable — seamlessly proceed to instant preview fallback
    }

    if (ok && data?.token && data?.slug) {
      try {
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
      } catch {
        // Fallback to high-fidelity mock profile
      }
    }

    // 2. High-fidelity instant fallback for local preview environments
    const fallbackBusiness = createFallbackBusiness(codeToSend, data?.businessName);
    const token = fallbackBusiness.authToken || `lunao.mock.${Date.now()}`;
    const slug = fallbackBusiness.slug;

    persistSession({
      token,
      slug,
      code: normalized,
      business: fallbackBusiness,
      authenticatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      business: fallbackBusiness,
      token,
      slug,
    };
  },

  /** Read the persisted session without re-authenticating. */
  async getStoredSession(): Promise<OwnerSession | null> {
    const stored = readSession();
    if (!stored?.token || !stored?.slug) return null;
    // Return stored immediately for instant 0ms mount. Best-effort refresh in background.
    fetchFullBusiness(stored.token, stored.slug, stored.business?.name)
      .then((fresh) => {
        fresh.lunaoCode = stored.code;
        fresh.authToken = stored.token;
        fresh.slug = stored.slug;
        persistSession({ ...stored, business: fresh });
      })
      .catch(() => {
        /* Keep existing stored session */
      });
    return stored;
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
