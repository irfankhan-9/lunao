// Shared HTTP client + tenant data service for the Owner PWA.
//
// All requests flow through fetchPwa() which automatically:
//   - Sends the bearer token from localStorage as Authorization header
//   - Routes under /api/pwa/:slug/* (slug + token come from the auth session)
//   - Throws an Error with the server's error message on non-2xx
//   - Returns the parsed JSON `body` of the response
import {
  TenantBusiness,
  Booking,
  Customer,
  Conversation,
  Automation,
  EmailTemplate,
  EmailActivityRecord,
  Review,
  Integration,
  ActivityEvent,
  ConnectedEmailAccount,
  BookingStatus,
} from '../types';
import { tenantAuthService } from './tenantAuthService';

async function fetchPwa<T = any>(
  path: string,
  init: RequestInit = {},
  options: { requireAuth?: boolean } = {},
): Promise<T> {
  const token = tenantAuthService.getAuthToken();
  if (options.requireAuth !== false && !token) {
    throw new Error('Not authenticated. Please sign in with your owner code.');
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = path.startsWith('http') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Tenant data service — facade over /api/pwa/* for all domain data.
// Page components and other services call into here.
// ---------------------------------------------------------------------------
export const tenantDataService = {
  async getBusiness(businessId: string): Promise<TenantBusiness> {
    const data = await fetchPwa<{ business: any }>('/pwa/me');
    const b = data.business || {};
    return {
      id: b.slug || businessId,
      lunaoCode: '',
      slug: b.slug || businessId,
      name: b.name || businessId,
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
      aiSettings: undefined as any,
      websiteConfig: undefined as any,
    } as TenantBusiness;
  },

  async updateBusiness(businessId: string, updates: Partial<TenantBusiness>): Promise<TenantBusiness> {
    const body: any = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.tagline !== undefined) body.tagline = updates.tagline;
    if (updates.phone !== undefined) body.phone = updates.phone;
    if (updates.email !== undefined) body.email = updates.email;
    if (updates.address !== undefined) body.address = updates.address;
    if (updates.city !== undefined) body.city = updates.city;
    if (updates.state !== undefined) body.state = updates.state;
    if (updates.timezone !== undefined) body.timezone = updates.timezone;
    if (updates.socialLinks !== undefined) body.socialLinks = updates.socialLinks;
    if (updates.theme !== undefined) body.theme = updates.theme;
    const data = await fetchPwa<{ business: any }>('/pwa/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return this.getBusiness(data.business?.slug || businessId);
  },

  async getAISettings(businessId: string): Promise<TenantBusiness['aiSettings']> {
    const data = await fetchPwa<{ aiSettings: any }>('/pwa/me/ai-settings');
    return aiFromApi(data.aiSettings);
  },

  async updateAISettings(
    businessId: string,
    settings: Partial<TenantBusiness['aiSettings']>,
  ): Promise<TenantBusiness['aiSettings']> {
    const data = await fetchPwa<{ aiSettings: any }>('/pwa/me/ai-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return aiFromApi(data.aiSettings);
  },

  async getWebsiteConfig(businessId: string): Promise<TenantBusiness['websiteConfig']> {
    const data = await fetchPwa<{ website: any }>('/pwa/me/website');
    return websiteFromApi(data.website);
  },

  async updateWebsiteConfig(
    businessId: string,
    cfg: Partial<TenantBusiness['websiteConfig']>,
  ): Promise<TenantBusiness['websiteConfig']> {
    const data = await fetchPwa<{ website: any }>('/pwa/me/website', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    });
    return websiteFromApi(data.website);
  },

  async deployWebsite(businessId: string): Promise<TenantBusiness['websiteConfig']> {
    const data = await fetchPwa<{ website: any }>('/pwa/me/website/deploy', {
      method: 'POST',
    });
    return websiteFromApi(data.website);
  },

  async getIntegrations(businessId: string): Promise<Integration[]> {
    const data = await fetchPwa<{ integrations: any[] }>('/pwa/me/integrations');
    return (data.integrations || []).map(integrationFromApi);
  },

  async getConnectedEmail(businessId: string): Promise<ConnectedEmailAccount | null> {
    const integrations = await this.getIntegrations(businessId);
    const emailInt = integrations.find((i) => i.provider === 'email_provider');
    if (!emailInt) return null;
    return {
      email: emailInt.connectedAccount || '',
      provider: 'gmail',
      status: emailInt.status === 'connected' ? 'active' : 'expired',
      connectedAt: emailInt.lastSync || new Date().toISOString(),
    };
  },

  async getDashboard(businessId: string): Promise<{
    todayBookingsCount: number;
    upcomingBookingsCount: number;
    totalCustomersCount: number;
    activeAutomationsCount: number;
  }> {
    const data = await fetchPwa<{ dashboard: any }>('/pwa/me/dashboard');
    return {
      todayBookingsCount: Number(data.dashboard?.todayBookings || 0),
      upcomingBookingsCount: Number(data.dashboard?.upcomingBookings || 0),
      totalCustomersCount: Number(data.dashboard?.totalCustomers || 0),
      activeAutomationsCount: 0,
    };
  },

  // Bookings
  async getBookings(businessId: string): Promise<Booking[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ bookings: any[] }>(`/pwa/${encodeURIComponent(slug)}/bookings`);
    return (data.bookings || []).map(bookingFromApi);
  },

  async updateBookingStatus(businessId: string, id: string, status: BookingStatus): Promise<Booking> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ booking: any }>(
      `/pwa/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
    return bookingFromApi(data.booking);
  },

  async createBooking(businessId: string, data: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const res = await fetchPwa<{ booking: any }>(
      `/pwa/${encodeURIComponent(slug)}/bookings`,
      {
        method: 'POST',
        body: JSON.stringify({
          customerName: data.customerName,
          phone: data.customerPhone,
          email: data.customerEmail,
          service: data.service,
          date: data.date,
          time: data.time,
          notes: data.notes,
          source: (data.source || 'form').toLowerCase(),
        }),
      },
    );
    return bookingFromApi(res.booking);
  },

  // Customers (derived server-side from bookings + pwa_customers enrichment)
  async getCustomers(businessId: string): Promise<Customer[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ customers: any[] }>(`/pwa/${encodeURIComponent(slug)}/customers`);
    return (data.customers || []).map(customerFromApi);
  },

  async createCustomer(
    businessId: string,
    data: { name: string; phone?: string; email?: string; notes?: string },
  ): Promise<Customer> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const res = await fetchPwa<{ customer: any }>(
      `/pwa/${encodeURIComponent(slug)}/customers`,
      { method: 'POST', body: JSON.stringify(data) },
    );
    return customerFromApi(res.customer);
  },

  async updateCustomerNotes(businessId: string, id: string, notes: string): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(`/pwa/${encodeURIComponent(slug)}/customers/${encodeURIComponent(id)}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    });
  },

  // Conversations
  async getConversations(businessId: string): Promise<Conversation[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ conversations: any[] }>(`/pwa/${encodeURIComponent(slug)}/conversations`);
    return (data.conversations || []).map(convFromApi);
  },

  async getConversationMessages(businessId: string, sessionId: string): Promise<Conversation | null> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    try {
      const data = await fetchPwa<{ session: any }>(
        `/pwa/${encodeURIComponent(slug)}/conversations/${encodeURIComponent(sessionId)}`,
      );
      return convFromApi(data.session);
    } catch {
      return null;
    }
  },

  // Automations
  async getAutomations(businessId: string): Promise<Automation[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ automations: any[] }>(`/pwa/${encodeURIComponent(slug)}/automations`);
    return (data.automations || []).map(automationFromApi);
  },

  async updateAutomation(businessId: string, id: number, updates: Partial<Automation>): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(
      `/pwa/${encodeURIComponent(slug)}/automations/${encodeURIComponent(String(id))}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          enabled: updates.enabled,
          timingValue: updates.timing?.value,
          timingUnit: updates.timing?.unit,
          subject: updates.emailSubject,
          body: updates.emailBody,
        }),
      },
    );
  },

  // Email templates
  async getEmailTemplates(businessId: string): Promise<EmailTemplate[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ templates: any[] }>(`/pwa/${encodeURIComponent(slug)}/email/templates`);
    return (data.templates || []).map(emailTemplateFromApi);
  },

  async createEmailTemplate(businessId: string, tpl: Partial<EmailTemplate>): Promise<EmailTemplate> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ template: any }>(
      `/pwa/${encodeURIComponent(slug)}/email/templates`,
      { method: 'POST', body: JSON.stringify(tpl) },
    );
    return emailTemplateFromApi(data.template);
  },

  async updateEmailTemplate(businessId: string, id: string, tpl: Partial<EmailTemplate>): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(
      `/pwa/${encodeURIComponent(slug)}/email/templates/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(tpl) },
    );
  },

  async deleteEmailTemplate(businessId: string, id: string): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(
      `/pwa/${encodeURIComponent(slug)}/email/templates/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  // Email activity
  async getEmailActivity(businessId: string): Promise<EmailActivityRecord[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ activity: any[] }>(`/pwa/${encodeURIComponent(slug)}/email/activity`);
    return (data.activity || []).map(emailActivityFromApi);
  },

  async sendEmail(
    businessId: string,
    payload: {
      recipientName?: string;
      recipientEmail: string;
      templateName?: string;
      subject: string;
      bodyPreview: string;
    },
  ): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(`/pwa/${encodeURIComponent(slug)}/email/send`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Reviews
  async getReviews(businessId: string): Promise<Review[]> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    const data = await fetchPwa<{ reviews: any[] }>(`/pwa/${encodeURIComponent(slug)}/reviews`);
    return (data.reviews || []).map(reviewFromApi);
  },

  async respondToReview(businessId: string, id: string, response: string): Promise<void> {
    const slug = tenantAuthService.getActiveSlug() || businessId;
    await fetchPwa(`/pwa/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ response }),
    });
  },

  // Activities — synthesized from bookings + email activity + reviews.
  async getActivities(businessId: string): Promise<ActivityEvent[]> {
    const [bookings, email, reviews] = await Promise.all([
      this.getBookings(businessId).catch(() => []),
      this.getEmailActivity(businessId).catch(() => []),
      this.getReviews(businessId).catch(() => []),
    ]);
    const events: ActivityEvent[] = [];
    for (const b of bookings.slice(0, 20)) {
      events.push({
        id: `b-${b.id}`,
        type: 'booking_created',
        title: `New booking: ${b.customerName}`,
        timestamp: b.createdAt || `${b.date} ${b.time}`,
        description: `${b.service || 'Service'} on ${b.date} at ${b.time}.`,
      });
    }
    for (const e of email.slice(0, 20)) {
      events.push({
        id: `e-${e.id}`,
        type: 'email_sent',
        title: `Email ${e.status}: ${e.templateName || e.subject || 'Send'}`,
        timestamp: e.sentAt,
        description: `To ${e.recipientName || e.recipientEmail}`,
      });
    }
    for (const r of reviews.slice(0, 10)) {
      events.push({
        id: `r-${r.id}`,
        type: 'automation_executed' as any,
        title: `New ${r.rating}-star review`,
        timestamp: r.createdAt,
        description: `${r.customerName}: ${(r.comment || '').slice(0, 80)}`,
      });
    }
    events.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    return events.slice(0, 30);
  },
};

// ---------------------------------------------------------------------------
// Mapping helpers (server snake_case → client camelCase)
// ---------------------------------------------------------------------------
function bookingFromApi(b: any): Booking {
  if (!b) return null as any;
  return {
    id: String(b.id),
    customerName: b.customerName || b.customer_name || '',
    customerPhone: b.phone || b.customerPhone || '',
    customerEmail: b.email || b.customerEmail || null,
    service: b.service || null,
    date: b.date || '',
    time: b.time || '',
    durationMinutes: b.durationMinutes || null,
    status: (b.status === 'cancelled' ? 'cancelled' : b.status === 'completed' ? 'completed' : 'confirmed'),
    source: b.source
      ? (b.source.charAt(0).toUpperCase() + b.source.slice(1))
      : 'Website',
    notes: b.notes || null,
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
  };
}

function customerFromApi(c: any): Customer {
  return {
    id: String(c.id ?? c.key ?? c.email ?? c.phone ?? ''),
    name: c.name || '',
    phone: c.phone || '',
    email: c.email || null,
    bookingCount: c.bookingCount || 0,
    lastBookingDate: c.lastBookingDate || null,
    lastService: c.lastService || null,
    notes: c.notes || null,
    createdAt: c.createdAt || new Date().toISOString(),
    recentBookings: (c.bookings || []).map((b: any) => bookingFromApi(b)),
  };
}

function convFromApi(c: any): Conversation {
  return {
    id: c.id,
    customerIdentifier: c.customerIdentifier || `Visitor ${c.id?.slice(0, 6)}`,
    customerPhone: c.customerPhone || null,
    customerEmail: c.customerEmail || null,
    lastMessage: c.lastMessage || c.last_message || '',
    timestamp: c.timestamp || c.createdAt || '',
    resultingBookingId: c.resultingBookingId || null,
    messages: (c.messages || []).map((m: any) => ({
      id: m.id,
      sender: m.sender === 'assistant' || m.sender === 'ai' ? 'ai' : 'visitor',
      text: m.text || m.content || '',
      timestamp: m.timestamp || '',
    })),
  };
}

function automationFromApi(a: any): Automation {
  return {
    id: String(a.id),
    templateId: a.key || String(a.id),
    name: a.key || `Automation ${a.id}`,
    description: a.body || '',
    trigger: a.key || '',
    timing: {
      timingType: 'hours_before',
      value: a.timingValue || 1,
      unit: a.timingUnit || 'hours',
    },
    actions: [],
    steps: [],
    emailSubject: a.subject || '',
    emailBody: a.body || '',
    enabled: !!a.enabled,
    lastExecutedAt: null,
    executionCount: 0,
  };
}

function emailTemplateFromApi(t: any): EmailTemplate {
  return {
    id: String(t.id),
    name: t.name || '',
    category: t.category || 'custom',
    subject: t.subject || '',
    body: t.body || '',
  };
}

function emailActivityFromApi(e: any): EmailActivityRecord {
  return {
    id: String(e.id),
    recipientName: e.recipientName || '',
    recipientEmail: e.recipientEmail || '',
    templateName: e.templateName || '',
    subject: e.subject || '',
    sentAt: e.sentAt || '',
    status: e.status === 'failed' ? 'sent' : 'delivered',
  };
}

function reviewFromApi(r: any): Review {
  return {
    id: String(r.id),
    customerName: r.customerName || '',
    customerEmail: r.customerEmail || null,
    rating: Number(r.rating || 0),
    service: r.service || '',
    comment: r.comment || '',
    createdAt: r.createdAt || '',
    source: (r.source as any) || 'Direct Feedback',
    status: r.status === 'responded' ? 'responded' : 'published',
    response: r.response || null,
    respondedAt: r.respondedAt || null,
  };
}

function integrationFromApi(i: any): Integration {
  return {
    id: i.id ? String(i.id) : i.provider,
    provider: (i.provider as any) || 'calendar_sync',
    name: i.name || '',
    description: i.description || '',
    status: (i.status as any) || 'not_connected',
    connectedAccount: i.connectedAccount || null,
    lastSync: i.lastSync || null,
  };
}

function aiFromApi(ai: any): TenantBusiness['aiSettings'] {
  return {
    enabled: !!ai?.enabled,
    greeting: ai?.greeting || '',
    tone: ai?.tone || 'friendly',
    businessDescription: ai?.businessDescription || '',
    businessHours: ai?.businessHours || '',
    locationDetails: ai?.locationDetails || '',
    faqs: ai?.faqs || [],
    policies: ai?.policies || '',
    bookingEnabled: !!ai?.bookingEnabled,
    bookingInstructions: ai?.bookingInstructions || '',
    infoToCollect: ai?.infoToCollect || [],
    confirmationBehavior: ai?.confirmationBehavior || '',
    doNotClaim: ai?.doNotClaim || '',
    escalationGuidance: ai?.escalationGuidance || '',
  };
}

function websiteFromApi(w: any): TenantBusiness['websiteConfig'] {
  return {
    url: w?.url || '',
    status: w?.status || 'draft',
    lastUpdated: w?.lastUpdated || null,
    lastDeployed: w?.lastDeployed || null,
    headline: w?.headline || '',
    subheadline: w?.subheadline || '',
    heroImage: w?.heroImage || '',
    ctaText: w?.ctaText || '',
    announcement: w?.announcement || '',
  };
}

export { fetchPwa };
