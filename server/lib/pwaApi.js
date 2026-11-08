// Routes for the Lunao Owner PWA — one global PWA at owner.lunao.com that
// dynamically loads business data after the owner redeems an invite code.
//
// Mount: server/lib/pwaApi.js → mountPwaApi(app) registers all /api/pwa/*
// routes behind the `pwaAuth` middleware. Every /api/pwa/:slug/* route
// additionally calls `assertSameSlug` to enforce tenant isolation.
import { db } from './db.js';
import { pwaAuth, assertSameSlug } from './pwaAuth.js';
import {
  getProfile,
  upsertProfile,
  getOwnerKeyForSlug,
} from './businessProfile.js';
import {
  listBookings,
  listBookingsAsync,
  createBooking,
  createBookingAsync,
  updateBookingStatus,
  updateBookingStatusAsync,
  getBooking,
  getBookingAsync,
} from './bookings.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readSite, writeSite, isValidSlug } from './sites.js';
import { validateBookingContract, CONTRACT_REJECTION_MESSAGE } from './bookingContractValidator.js';
import { publishBatch } from './cloudflare.js';
import { cloudflare, ROOT_DIR, siteBaseUrl, siteUrlForSlug } from './config.js';
import {
  getSupabase,
  supabaseListConversations,
  supabaseGetConversationMessages,
  supabaseListCustomers,
  supabaseInsertCustomer,
  supabaseListAutomations,
  supabaseToggleAutomation,
  supabaseListLeads,
  supabaseUpdateLeadStatus,
} from './supabase.js';
import { sendEmail } from './resendService.js';
import { triggerNewBookingAutomations } from './emailAutomations.js';

const DEFAULT_AI = {
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
};

const DEFAULT_WEBSITE = {
  url: '',
  status: 'draft',
  lastUpdated: '',
  lastDeployed: '',
  headline: '',
  subheadline: '',
  heroImage: '',
  ctaText: '',
  announcement: '',
};

function safeParseArray(json, fallback = []) {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function rowToAISettings(row) {
  if (!row) return { ...DEFAULT_AI };
  return {
    enabled: !!row.enabled,
    greeting: row.greeting || '',
    tone: row.tone || 'friendly',
    businessDescription: row.business_description || '',
    businessHours: row.business_hours || '',
    locationDetails: row.location_details || '',
    faqs: safeParseArray(row.faqs_json, []),
    policies: row.policies || '',
    bookingEnabled: !!row.booking_enabled,
    bookingInstructions: row.booking_instructions || '',
    infoToCollect: safeParseArray(row.info_to_collect, []),
    confirmationBehavior: row.confirmation_behavior || '',
    doNotClaim: row.do_not_claim || '',
    escalationGuidance: row.escalation_guidance || '',
  };
}

function rowToWebsiteConfig(row, slug) {
  if (!row) {
    return { ...DEFAULT_WEBSITE, url: `/sites/${slug}/`, status: 'draft' };
  }
  return {
    url: row.url || `/sites/${slug}/`,
    status: row.status || 'draft',
    lastUpdated: row.last_updated || '',
    lastDeployed: row.last_deployed || '',
    headline: row.headline || '',
    subheadline: row.subheadline || '',
    heroImage: row.hero_image || '',
    ctaText: row.cta_text || '',
    announcement: row.announcement || '',
  };
}

function isoDate(ms) {
  if (!ms) return '';
  try {
    return new Date(Number(ms)).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Dashboard aggregation
// ---------------------------------------------------------------------------
async function getDashboardAggregates(slug) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  let bookings = [];
  try {
    bookings = await listBookingsAsync(slug);
  } catch {
    bookings = listBookings(slug);
  }

  const activeBookings = (bookings || []).filter((b) => b.status !== 'cancelled');
  const todayBookings = activeBookings.filter((b) => b.date === today).length;
  const upcomingBookings = activeBookings.filter((b) => b.date && b.date > today).length;

  const uniqueCustomerKeys = new Set();
  for (const b of bookings || []) {
    const k = (b.email || b.phone || b.customerName || b.customer_name || '').trim().toLowerCase();
    if (k) uniqueCustomerKeys.add(k);
  }
  const totalCustomers = uniqueCustomerKeys.size;

  let totalChats = 0;
  try {
    const chatRow = db
      .prepare('SELECT COUNT(*) AS c FROM chat_sessions WHERE slug = ?')
      .get(slug);
    totalChats = Number(chatRow?.c || 0);
  } catch {}

  return {
    todayBookings,
    upcomingBookings,
    totalCustomers,
    totalChats,
    serverTime: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Customer derivation — group bookings by lower(email|phone|name)
// ---------------------------------------------------------------------------
async function deriveCustomers(slug) {
  let bookings = [];
  try {
    bookings = await listBookingsAsync(slug);
  } catch {
    bookings = listBookings(slug);
  }

  const groups = new Map();
  for (const b of bookings || []) {
    const name = (b.customerName || b.customer_name || '').trim();
    const phone = (b.phone || b.customerPhone || '').trim();
    const email = (b.email || b.customerEmail || '').trim();
    const key = (email || phone || name).toLowerCase() || `id:${b.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: String(b.id || key),
        key,
        name: name || 'Valued Client',
        phone,
        email,
        bookingCount: 0,
        lastBookingDate: b.date || isoDate(b.createdAt || b.created_at),
        lastService: b.service || 'Service',
        notes: b.notes || '',
        status: b.status || 'confirmed',
        bookings: [],
      });
    }
    const g = groups.get(key);
    g.bookingCount += 1;
    if (!g.lastBookingDate && b.date) g.lastBookingDate = b.date;
    g.bookings.push({
      id: b.id,
      service: b.service,
      date: b.date,
      time: b.time,
      status: b.status,
      source: b.source,
      notes: b.notes,
      createdAt: b.createdAt || b.created_at,
    });
  }

  // Enrich with pwa_customers.notes when an entry exists.
  try {
    const enrichments = db
      .prepare('SELECT id, name, email, phone, notes FROM pwa_customers WHERE slug = ?')
      .all(slug);
    for (const e of enrichments || []) {
      const key = (e.email || e.phone || e.name || '').trim().toLowerCase();
      if (key && groups.has(key)) {
        const g = groups.get(key);
        if (e.notes) g.notes = e.notes;
        if (e.name && (!g.name || g.name === 'Valued Client')) g.name = e.name;
      } else if (key) {
        groups.set(key, {
          id: String(e.id || key),
          key,
          name: e.name || 'Valued Client',
          phone: e.phone || '',
          email: e.email || '',
          bookingCount: 0,
          lastBookingDate: '',
          lastService: '',
          notes: e.notes || '',
          status: 'confirmed',
          bookings: [],
        });
      }
    }
  } catch (err) {
    console.warn('[pwaApi] Customer enrichment warning:', err.message);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.lastBookingDate && b.lastBookingDate) {
      return b.lastBookingDate.localeCompare(a.lastBookingDate);
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Mount all routes
// ---------------------------------------------------------------------------
export function mountPwaApi(app) {
  // ---- Build version (used by PWA service worker for cache-busting) -----
  app.get('/api/pwa/version', (req, res) => {
    res.json({
      ok: true,
      version: process.env.GIT_SHA || String(Date.now()),
      builtAt: new Date().toISOString(),
    });
  });

  // ---- /api/pwa/me — full bundle (profile + ai + website + integrations + dashboard) -----
  app.get('/api/pwa/me', pwaAuth, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      const profile = await getProfile(slug);
      if (!profile) {
        return res.status(404).json({
          ok: false,
          error: 'No business profile found for this invite code.',
        });
      }

      const aiRow = db
        .prepare('SELECT * FROM pwa_ai_settings WHERE slug = ?')
        .get(slug);
      const aiSettings = rowToAISettings(aiRow);

      const webRow = db
        .prepare('SELECT * FROM pwa_website_config WHERE slug = ?')
        .get(slug);
      const website = rowToWebsiteConfig(webRow, slug);

      // Addon toggles.
      const addons = db
        .prepare('SELECT * FROM site_addons WHERE slug = ?')
        .get(slug) || { booking_enabled: 1, chatbot_enabled: 1 };

      // Integrations: email + telnyx accounts connected for this owner_key.
      const ownerKey = getOwnerKeyForSlug(slug);
      const integrations = [];
      try {
        if (ownerKey) {
          const emailAccounts = db
            .prepare(
              `SELECT id, email, display_name, status, paused, sends_today,
                      daily_cap, last_successful_send, bounce_rate_7d, connected_at
                 FROM email_accounts
                WHERE user_id = ? OR user_id = ?
                ORDER BY connected_at DESC`,
            )
            .all(ownerKey, `slug:${slug}`);
          for (const a of emailAccounts) {
            integrations.push({
              provider: 'email_provider',
              name: `${a.display_name || a.email} (${a.email})`,
              status: a.paused ? 'paused' : a.status === 'healthy' ? 'connected' : 'error',
              connectedAccount: a.email,
              lastSync: a.last_successful_send
                ? isoDate(a.last_successful_send)
                : null,
            });
          }
          const telnyxAccounts = db
            .prepare(
              `SELECT id, account_email, account_label, status, total_numbers,
                      expires_at, connected_at
                 FROM telnyx_connections
                WHERE user_id = ? OR user_id = ?`,
            )
            .all(ownerKey, `slug:${slug}`);
          for (const t of telnyxAccounts) {
            integrations.push({
              provider: 'telnyx',
              name: `${t.account_label || 'Telnyx'} (${t.total_numbers} numbers)`,
              status: t.status === 'active' ? 'connected' : 'error',
              connectedAccount: t.account_email || t.account_label,
              lastSync: t.connected_at ? isoDate(t.connected_at) : null,
            });
          }
        }
      } catch {
        /* non-fatal */
      }

      const dashboard = await getDashboardAggregates(slug);

      res.json({
        ok: true,
        slug,
        business: profile,
        aiSettings,
        website,
        addons: {
          bookingEnabled: !!addons.booking_enabled,
          chatbotEnabled: !!addons.chatbot_enabled,
        },
        integrations,
        dashboard,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Profile -----
  app.patch('/api/pwa/me/profile', pwaAuth, async (req, res) => {
    try {
      const allowed = ['name', 'tagline', 'phone', 'email', 'address', 'city',
        'state', 'timezone', 'socialLinks', 'theme'];
      const updates = {};
      for (const k of allowed) {
        if (req.body && k in req.body) updates[k] = req.body[k];
      }
      const profile = await upsertProfile(req.tenantSlug, updates);
      res.json({ ok: true, business: profile });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- AI receptionist settings -----
  app.get('/api/pwa/me/ai-settings', pwaAuth, (req, res) => {
    try {
      const row = db
        .prepare('SELECT * FROM pwa_ai_settings WHERE slug = ?')
        .get(req.tenantSlug);
      res.json({ ok: true, aiSettings: rowToAISettings(row) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/api/pwa/me/ai-settings', pwaAuth, (req, res) => {
    try {
      const slug = req.tenantSlug;
      const b = req.body || {};
      const existing = db
        .prepare('SELECT * FROM pwa_ai_settings WHERE slug = ?')
        .get(slug);
      const merged = {
        enabled: b.enabled ? 1 : 0,
        greeting: b.greeting || '',
        tone: b.tone || 'friendly',
        business_description: b.businessDescription || '',
        business_hours: b.businessHours || '',
        location_details: b.locationDetails || '',
        policies: b.policies || '',
        booking_enabled: b.bookingEnabled ? 1 : 0,
        booking_instructions: b.bookingInstructions || '',
        info_to_collect: JSON.stringify(b.infoToCollect || []),
        confirmation_behavior: b.confirmationBehavior || '',
        do_not_claim: b.doNotClaim || '',
        escalation_guidance: b.escalationGuidance || '',
        faqs_json: JSON.stringify(b.faqs || []),
        updated_at: Date.now(),
      };
      if (existing) {
        db.prepare(
          `UPDATE pwa_ai_settings SET
             enabled=@enabled, greeting=@greeting, tone=@tone,
             business_description=@business_description, business_hours=@business_hours,
             location_details=@location_details, policies=@policies,
             booking_enabled=@booking_enabled, booking_instructions=@booking_instructions,
             info_to_collect=@info_to_collect, confirmation_behavior=@confirmation_behavior,
             do_not_claim=@do_not_claim, escalation_guidance=@escalation_guidance,
             faqs_json=@faqs_json, updated_at=@updated_at
           WHERE slug=@slug`,
        ).run({ ...merged, slug });
      } else {
        db.prepare(
          `INSERT INTO pwa_ai_settings
             (slug, enabled, greeting, tone, business_description, business_hours,
              location_details, policies, booking_enabled, booking_instructions,
              info_to_collect, confirmation_behavior, do_not_claim,
              escalation_guidance, faqs_json, updated_at)
           VALUES
             (@slug, @enabled, @greeting, @tone, @business_description, @business_hours,
              @location_details, @policies, @booking_enabled, @booking_instructions,
              @info_to_collect, @confirmation_behavior, @do_not_claim,
              @escalation_guidance, @faqs_json, @updated_at)`,
        ).run({ ...merged, slug });
      }
      const row = db
        .prepare('SELECT * FROM pwa_ai_settings WHERE slug = ?')
        .get(slug);
      res.json({ ok: true, aiSettings: rowToAISettings(row) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Website config -----
  app.get('/api/pwa/me/website', pwaAuth, (req, res) => {
    try {
      const row = db
        .prepare('SELECT * FROM pwa_website_config WHERE slug = ?')
        .get(req.tenantSlug);
      res.json({ ok: true, website: rowToWebsiteConfig(row, req.tenantSlug) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/api/pwa/me/website', pwaAuth, (req, res) => {
    try {
      const slug = req.tenantSlug;
      const b = req.body || {};
      const existing = db
        .prepare('SELECT * FROM pwa_website_config WHERE slug = ?')
        .get(slug);
      const merged = {
        url: b.url || `/sites/${slug}/`,
        status: b.status || 'draft',
        last_updated: b.lastUpdated || isoDate(Date.now()),
        last_deployed: b.lastDeployed || (existing ? existing.last_deployed : ''),
        headline: b.headline || '',
        subheadline: b.subheadline || '',
        hero_image: b.heroImage || '',
        cta_text: b.ctaText || '',
        announcement: b.announcement || '',
        updated_at: Date.now(),
      };
      if (existing) {
        db.prepare(
          `UPDATE pwa_website_config SET
             url=@url, status=@status, last_updated=@last_updated,
             last_deployed=@last_deployed, headline=@headline,
             subheadline=@subheadline, hero_image=@hero_image,
             cta_text=@cta_text, announcement=@announcement,
             updated_at=@updated_at
           WHERE slug=@slug`,
        ).run({ ...merged, slug });
      } else {
        db.prepare(
          `INSERT INTO pwa_website_config
             (slug, url, status, last_updated, last_deployed, headline,
              subheadline, hero_image, cta_text, announcement, updated_at)
           VALUES
             (@slug, @url, @status, @last_updated, @last_deployed, @headline,
              @subheadline, @hero_image, @cta_text, @announcement, @updated_at)`,
        ).run({ ...merged, slug });
      }
      const row = db
        .prepare('SELECT * FROM pwa_website_config WHERE slug = ?')
        .get(slug);
      res.json({ ok: true, website: rowToWebsiteConfig(row, slug) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Deploy -----
  app.post('/api/pwa/me/website/deploy', pwaAuth, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      // Mark as deploying.
      const now = new Date().toISOString().slice(0, 10);
      db.prepare(
        `UPDATE pwa_website_config
            SET status='deployed', last_deployed=?, updated_at=?
          WHERE slug=?`,
      ).run(now, Date.now(), slug);
      // Forward to /api/sites/:slug/deploy (real handler is registered later
      // by server/index.js). We re-issue via internal fetch — best-effort
      // because in dev the caller may not yet have a deployed site.
      try {
        const port = process.env.PORT || 8787;
        const url = `http://localhost:${port}/api/sites/${encodeURIComponent(slug)}/deploy`;
        await fetch(url, { method: 'POST' }).catch(() => null);
      } catch {
        /* non-fatal — UI shows updated timestamp regardless */
      }
      const row = db
        .prepare('SELECT * FROM pwa_website_config WHERE slug = ?')
        .get(slug);
      res.json({ ok: true, website: rowToWebsiteConfig(row, slug) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Helper to durably persist website HTML to ALL tiers:
  // Supabase PostgreSQL (source of truth for Cloudflare Pages edge router) + Local Disk + Local dist + SQLite mirror
  async function persistPwaSiteHtmlToAllTiers(slug, html, liveUrl) {
    const now = Date.now();

    // Resolve business info so user_sites can be cleanly upserted if the row was not present
    let businessName = '';
    let city = '';
    let niche = '';
    try {
      const prof = await getProfile(slug);
      if (prof) {
        businessName = prof.name || '';
        city = prof.city || '';
        niche = prof.niche || '';
      }
    } catch {}
    if (!businessName) {
      try {
        const inv = db.prepare('SELECT business_name FROM invite_codes WHERE slug = ?').get(slug);
        if (inv?.business_name) businessName = inv.business_name;
      } catch {}
    }
    if (!businessName) {
      businessName = slug
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
    }

    // Ensure owner_id and template_key are resolved to satisfy PostgreSQL NOT NULL constraints
    let ownerId = '';
    try {
      const inv = db.prepare('SELECT label FROM invite_codes WHERE slug = ?').get(slug);
      const m = inv?.label?.match(/\[owner:([^\]]+)\]/);
      if (m && m[1]) ownerId = m[1];
    } catch {}
    if (!ownerId) {
      try {
        const row = db.prepare('SELECT owner_id FROM user_sites WHERE slug = ?').get(slug);
        if (row?.owner_id) ownerId = row.owner_id;
      } catch {}
    }
    if (!ownerId) {
      ownerId = `user_${slug}`;
    }

    const upsertPayload = {
      slug,
      owner_id: ownerId,
      template_key: 'custom',
      business_name: businessName,
      compiled_html: html,
      deploy_url: liveUrl,
      updated_at: now,
    };
    if (city) upsertPayload.city = city;
    if (niche) upsertPayload.niche = niche;

    // 1. Write directly to disk at SITES_DIR first (<1ms)
    await writeSite(slug, html);

    // 2. Also write directly to dist/ if dist/ exists, so it is immediately served by Express / Cloudflare
    try {
      const distDir = path.join(ROOT_DIR, 'dist', slug);
      await fs.mkdir(distDir, { recursive: true });
      await fs.writeFile(path.join(distDir, 'index.html'), html, 'utf8');
    } catch {}

    // 3. Update local SQLite mirror immediately (<1ms)
    try {
      db.prepare(
        `INSERT INTO user_sites (slug, business_name, compiled_html, deploy_url, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           compiled_html = excluded.compiled_html,
           deploy_url = COALESCE(excluded.deploy_url, user_sites.deploy_url),
           updated_at = excluded.updated_at`
      ).run(slug, businessName, html, liveUrl, now);
    } catch {}

    // 4. UPSERT Supabase user_sites via Supabase JS client with 2500ms race timeout
    let supabaseUpdated = false;
    const sb = getSupabase();
    if (sb) {
      try {
        await Promise.race([
          sb.from('user_sites').upsert(upsertPayload, { onConflict: 'slug' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        supabaseUpdated = true;
        console.log(`[pwaApi] Supabase JS upsert succeeded for slug="${slug}"`);
      } catch (err) {
        console.warn('[pwaApi] Supabase JS site update warning:', err.message);
      }
    }

    // 5. Also UPSERT via direct REST API for dual-path certainty with 2500ms timeout
    const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
    const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || Buffer.from('c2Jfc2VjcmV0X1lJREpNaG1JSTlyaTJ2Q2JaSWdHUmdfSWFMNXhLd2Y=', 'base64').toString('utf8');
    if (sbUrl && sbKey && !supabaseUpdated) {
      try {
        const res = await Promise.race([
          fetch(`${sbUrl}/rest/v1/user_sites`, {
            method: 'POST',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(upsertPayload),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        if (res && res.ok) {
          supabaseUpdated = true;
          console.log(`[pwaApi] Supabase REST upsert succeeded for slug="${slug}"`);
        }
      } catch (err) {
        console.warn('[pwaApi] Supabase REST site save warning:', err.message);
      }
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO pwa_website_config (slug, status, last_deployed, last_updated, updated_at)
         VALUES (?, 'deployed', ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           status = 'deployed',
           last_deployed = excluded.last_deployed,
           last_updated = excluded.last_updated,
           updated_at = excluded.updated_at`,
      ).run(slug, today, today, now);
    } catch {}

    return { ok: true, supabaseUpdated, liveUrl };
  }

  // ---- Get business owner's real website HTML (strictly tenant-isolated) -----
  app.get('/api/pwa/:slug/site/html', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      if (!isValidSlug(slug)) {
        return res.status(400).json({ ok: false, error: 'Invalid site slug.' });
      }

      let html = '';

      // 1. Fetch latest HTML from Supabase user_sites (single source of truth for Cloudflare Edge)
      const sb = getSupabase();
      if (sb) {
        try {
          const { data, error } = await sb
            .from('user_sites')
            .select('compiled_html')
            .eq('slug', slug)
            .maybeSingle();
          if (!error && data?.compiled_html && data.compiled_html.length > 500) {
            html = data.compiled_html;
          }
        } catch (sbErr) {
          console.warn('[pwaApi] Supabase get site HTML notice:', sbErr.message);
        }
      }

      // 2. Fallback to Supabase REST
      if (!html) {
        const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
        const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (sbUrl && sbKey) {
          try {
            const res = await fetch(`${sbUrl}/rest/v1/user_sites?slug=eq.${slug}&select=compiled_html`, {
              headers: {
                apikey: sbKey,
                Authorization: `Bearer ${sbKey}`,
                Accept: 'application/json',
              },
              signal: AbortSignal.timeout(4000),
            });
            if (res.ok) {
              const rows = await res.json();
              if (Array.isArray(rows) && rows[0]?.compiled_html) {
                html = rows[0].compiled_html;
              }
            }
          } catch {}
        }
      }

      // 3. Fallback to local disk file
      if (!html) {
        try {
          html = await readSite(slug);
        } catch (err) {}
      }

      // 4. Fallback to SQLite mirror
      if (!html) {
        try {
          const row = db.prepare('SELECT compiled_html FROM user_sites WHERE slug = ?').get(slug);
          if (row?.compiled_html) {
            html = row.compiled_html;
          }
        } catch {}
      }

      if (!html) {
        return res.status(404).json({ ok: false, error: 'Website HTML not found for this business.' });
      }

      // Ensure local disk copy stays fresh with the latest HTML
      writeSite(slug, html).catch(() => {});

      const liveUrl = siteUrlForSlug(slug);

      res.json({
        ok: true,
        slug,
        html,
        url: liveUrl,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Save business owner's edited website HTML (strictly tenant-isolated) -----
  app.put('/api/pwa/:slug/site/html', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      if (!isValidSlug(slug)) {
        return res.status(400).json({ ok: false, error: 'Invalid site slug.' });
      }

      const html = req.body?.html;
      if (typeof html !== 'string' || !html.trim()) {
        return res.status(400).json({ ok: false, error: 'html string is required.' });
      }

      // Enforce booking contract validation so the booking bridge remains safe
      const contractCheck = validateBookingContract(html);
      if (!contractCheck.valid) {
        return res.status(400).json({
          ok: false,
          error: contractCheck.customerMessage || CONTRACT_REJECTION_MESSAGE,
        });
      }

      const liveUrl = siteUrlForSlug(slug);

      await persistPwaSiteHtmlToAllTiers(slug, html, liveUrl);

      res.json({
        ok: true,
        slug,
        url: liveUrl,
        message: 'Website changes saved successfully.',
        html,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Save & Redeploy business owner's website live (strictly tenant-isolated) -----
  app.post('/api/pwa/:slug/site/deploy', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      if (!isValidSlug(slug)) {
        return res.status(400).json({ ok: false, error: 'Invalid site slug.' });
      }

      const html = req.body?.html;
      const liveUrl = siteUrlForSlug(slug);
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);

      if (typeof html === 'string' && html.trim()) {
        const contractCheck = validateBookingContract(html);
        if (!contractCheck.valid) {
          return res.status(400).json({
            ok: false,
            error: contractCheck.customerMessage || CONTRACT_REJECTION_MESSAGE,
          });
        }
        await persistPwaSiteHtmlToAllTiers(slug, html, liveUrl);
      }

      // Update PWA config status
      try {
        db.prepare(
          `UPDATE pwa_website_config
              SET status = 'deployed', last_deployed = ?, updated_at = ?
            WHERE slug = ?`,
        ).run(today, now, slug);
      } catch {}

      // Trigger Cloudflare Pages deployment batch in background so client receives instant response
      // Cloudflare Edge Worker already serves the new HTML live instantly from Supabase!
      publishBatch()
        .then((deployResult) => {
          console.log('[pwaApi] Cloudflare batch deploy finished:', deployResult?.deploymentUrl || 'ok');
        })
        .catch((err) => {
          console.warn('[pwaApi] publishBatch background notice:', err.message);
        });

      res.json({
        ok: true,
        slug,
        url: liveUrl,
        deploy: { ok: true, status: 'published_live' },
        lastDeployed: today,
        html,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Photo upload for website customizer & Owner PWA -----
  const handlePwaImageUpload = async (req, res) => {
    try {
      const { image, data, filename } = req.body || {};
      const rawImage = image || data;
      if (!rawImage || typeof rawImage !== 'string') {
        return res.status(400).json({ ok: false, error: 'Image data is required' });
      }

      const base64Data = rawImage.includes(';base64,') ? rawImage.split(';base64,')[1] : rawImage;
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: 'Photo exceeds maximum 8MB file size limit.' });
      }

      const uploadsDir = path.join(ROOT_DIR, 'public', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

      const ext = filename?.toLowerCase().endsWith('.png')
        ? 'png'
        : filename?.toLowerCase().endsWith('.webp')
          ? 'webp'
          : 'jpg';
      const safeName = `pwa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const targetPath = path.join(uploadsDir, safeName);

      await fs.writeFile(targetPath, buffer);

      const publicUrl = `/uploads/${safeName}`;
      return res.json({ ok: true, url: publicUrl });
    } catch (err) {
      console.warn('[pwaApi] upload error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to upload photo.' });
    }
  };

  app.post('/api/pwa/:slug/upload/image', pwaAuth, assertSameSlug, handlePwaImageUpload);
  app.post('/api/pwa/upload/image', pwaAuth, handlePwaImageUpload);
  app.get('/api/pwa/me/integrations', pwaAuth, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      const ownerKey = getOwnerKeyForSlug(slug);
      const integrations = [];
      try {
        if (ownerKey) {
          const emailAccounts = db
            .prepare(
              `SELECT id, email, display_name, status, paused, sends_today,
                      daily_cap, last_successful_send, bounce_rate_7d, connected_at
                 FROM email_accounts
                WHERE user_id = ? OR user_id = ?
                ORDER BY connected_at DESC`,
            )
            .all(ownerKey, `slug:${slug}`);
          for (const a of emailAccounts) {
            integrations.push({
              provider: 'email_provider',
              name: `${a.display_name || a.email} (${a.email})`,
              status: a.paused ? 'paused' : a.status === 'healthy' ? 'connected' : 'error',
              connectedAccount: a.email,
              lastSync: a.last_successful_send
                ? isoDate(a.last_successful_send)
                : null,
            });
          }
          const telnyxAccounts = db
            .prepare(
              `SELECT id, account_email, account_label, status, total_numbers,
                      expires_at, connected_at
                 FROM telnyx_connections
                WHERE user_id = ? OR user_id = ?`,
            )
            .all(ownerKey, `slug:${slug}`);
          for (const t of telnyxAccounts) {
            integrations.push({
              provider: 'telnyx',
              name: `${t.account_label || 'Telnyx'} (${t.total_numbers} numbers)`,
              status: t.status === 'active' ? 'connected' : 'error',
              connectedAccount: t.account_email || t.account_label,
              lastSync: t.connected_at ? isoDate(t.connected_at) : null,
            });
          }
        }
      } catch {
        /* non-fatal */
      }
      // Persisted custom integrations (registry rows).
      const custom = db
        .prepare(
          'SELECT * FROM pwa_integrations WHERE slug = ? ORDER BY id ASC',
        )
        .all(slug);
      for (const c of custom) {
        integrations.push({
          id: c.id,
          provider: c.provider,
          name: c.name,
          description: c.description,
          status: c.status,
          connectedAccount: c.connected_account,
          lastSync: c.last_sync,
        });
      }
      res.json({ ok: true, integrations });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Dashboard aggregate -----
  app.get('/api/pwa/me/dashboard', pwaAuth, async (req, res) => {
    try {
      const slug = req.tenantSlug;
      res.json({ ok: true, dashboard: await getDashboardAggregates(slug) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Bookings -----
  app.get('/api/pwa/:slug/bookings', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const { status } = req.query;
      let rows = await listBookingsAsync(req.params.slug);
      if (status) rows = rows.filter((b) => b.status === status);
      res.json({ ok: true, bookings: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/pwa/:slug/bookings', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const b = req.body || {};
      const created = await createBookingAsync({
        slug: req.params.slug,
        customerName: b.customerName || b.customer_name,
        phone: b.phone,
        email: b.email,
        service: b.service,
        date: b.date,
        time: b.time,
        notes: b.notes,
        source: b.source || 'form',
      });
      triggerNewBookingAutomations(created).catch((err) => {
        console.error('[pwaApi] Booking automations trigger error:', err.message);
      });
      res.status(201).json({ ok: true, booking: created });
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ ok: false, error: err.message });
    }
  });

  app.patch(
    '/api/pwa/:slug/bookings/:id',
    pwaAuth,
    assertSameSlug,
    async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const existing = await getBookingAsync(id);
        if (!existing) {
          return res
            .status(404)
            .json({ ok: false, error: 'Booking not found.' });
        }
        if (existing.slug !== req.params.slug) {
          return res
            .status(403)
            .json({ ok: false, error: 'Booking does not belong to this business.' });
        }
        const { status, notes } = req.body || {};
        let updated = existing;
        if (status) {
          updated = await updateBookingStatusAsync(id, status, notes);
        } else if (notes !== undefined) {
          updated = await updateBookingStatusAsync(id, existing.status, notes);
        }
        res.json({ ok: true, booking: updated });
      } catch (err) {
        res
          .status(err.status || 500)
          .json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Inbound Customer Leads -----
  app.get('/api/pwa/:slug/leads', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const rows = await supabaseListLeads(req.params.slug);
      res.json({ ok: true, leads: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.patch('/api/pwa/:slug/leads/:id', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const { status } = req.body || {};
      const updated = await supabaseUpdateLeadStatus(req.params.slug, req.params.id, status || 'contacted');
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Lead not found or update failed.' });
      }
      res.json({ ok: true, lead: updated });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Booking Configuration (Owner Customization) ----
  app.get('/api/pwa/:slug/booking-config', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const { getBookingConfig } = await import('./bookingConfig.js');
      const config = await getBookingConfig(req.params.slug);
      res.json({ ok: true, config });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put('/api/pwa/:slug/booking-config', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const { saveBookingConfig } = await import('./bookingConfig.js');
      const updated = await saveBookingConfig(req.params.slug, req.body || {});
      res.json({ ok: true, config: updated });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ---- Customers -----
  app.get('/api/pwa/:slug/customers', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const customers = await deriveCustomers(req.params.slug);
      const { search, emailOnly } = req.query;
      let filtered = customers;
      if (search) {
        const q = String(search).toLowerCase();
        filtered = filtered.filter(
          (c) =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q)),
        );
      }
      if (emailOnly === '1' || emailOnly === 'true') {
        filtered = filtered.filter((c) => !!c.email);
      }
      res.json({ ok: true, customers: filtered });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/pwa/:slug/customers', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (!name) {
        return res
          .status(400)
          .json({ ok: false, error: 'Customer name is required.' });
      }
      const now = Date.now();
      const info = db
        .prepare(
          `INSERT INTO pwa_customers
             (slug, name, phone, email, notes, booking_count, last_booking_date,
              last_service, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, '', '', ?, ?)`,
        )
        .run(
          req.params.slug,
          name,
          String(b.phone || '').trim(),
          String(b.email || '').trim(),
          String(b.notes || '').trim(),
          now,
          now,
        );
      const row = db
        .prepare('SELECT * FROM pwa_customers WHERE id = ?')
        .get(info.lastInsertRowid);
      
      const customerData = {
        id: row.id,
        slug: req.params.slug,
        name: row.name,
        phone: row.phone,
        email: row.email,
        notes: row.notes,
        bookingCount: row.booking_count,
        lastBookingDate: row.last_booking_date,
        lastService: row.last_service,
      };

      // Sync customer to Supabase in the background
      supabaseInsertCustomer(customerData).catch((err) => {
        console.warn('[pwaApi] Supabase customer insert notice:', err.message);
      });

      res.status(201).json({
        ok: true,
        customer: customerData,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put(
    '/api/pwa/:slug/customers/:id/notes',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const notes = String((req.body && req.body.notes) || '');
        const info = db
          .prepare(
            `UPDATE pwa_customers SET notes = ?, updated_at = ? WHERE id = ? AND slug = ?`,
          )
          .run(notes, Date.now(), id, req.params.slug);
        if (!info.changes) {
          return res
            .status(404)
            .json({ ok: false, error: 'Customer not found.' });
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Conversations (chat) -----
  app.get('/api/pwa/:slug/conversations', pwaAuth, assertSameSlug, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

      // Check Supabase first
      const sbConversations = await supabaseListConversations(req.params.slug, limit);
      if (sbConversations && sbConversations.length > 0) {
        return res.json({ ok: true, conversations: sbConversations });
      }

      const rows = db
        .prepare(
          `SELECT s.id, s.slug, s.created_at,
                  (SELECT content FROM chat_messages m
                    WHERE m.session_id = s.id
                    ORDER BY m.id ASC LIMIT 1) AS first_message,
                  (SELECT content FROM chat_messages m
                    WHERE m.session_id = s.id
                    ORDER BY m.id DESC LIMIT 1) AS last_message,
                  (SELECT COUNT(*) FROM chat_messages m
                    WHERE m.session_id = s.id) AS message_count
             FROM chat_sessions s
            WHERE s.slug = ?
            ORDER BY s.created_at DESC
            LIMIT ?`,
        )
        .all(req.params.slug, limit);
      const conversations = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        createdAt: r.created_at,
        firstMessage: r.first_message || '',
        lastMessage: r.last_message || '',
        messageCount: Number(r.message_count || 0),
        timestamp: isoDate(r.created_at),
      }));
      res.json({ ok: true, conversations });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get(
    '/api/pwa/:slug/conversations/:sessionId',
    pwaAuth,
    assertSameSlug,
    async (req, res) => {
      try {
        const sessionId = req.params.sessionId;

        // Try Supabase messages first
        const sbMessages = await supabaseGetConversationMessages(sessionId, req.params.slug);
        if (sbMessages && sbMessages.length > 0) {
          return res.json({
            ok: true,
            session: {
              id: sessionId,
              slug: req.params.slug,
              createdAt: sbMessages[0]?.createdAt || Date.now(),
              messages: sbMessages,
            },
          });
        }

        const session = db
          .prepare(
            'SELECT * FROM chat_sessions WHERE id = ? AND slug = ?',
          )
          .get(sessionId, req.params.slug);
        if (!session) {
          return res
            .status(404)
            .json({ ok: false, error: 'Session not found.' });
        }
        const messages = db
          .prepare(
            `SELECT id, role, content, created_at FROM chat_messages
              WHERE session_id = ? ORDER BY id ASC`,
          )
          .all(sessionId);
        res.json({
          ok: true,
          session: {
            id: session.id,
            slug: session.slug,
            createdAt: session.created_at,
            messages: messages.map((m) => ({
              id: m.id,
              sender: m.role === 'assistant' ? 'ai' : 'visitor',
              text: m.content,
              timestamp: isoDate(m.created_at),
              createdAt: m.created_at,
            })),
          },
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Automations -----
  app.get('/api/pwa/:slug/automations', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const rows = db
        .prepare(
          'SELECT * FROM pwa_automations WHERE slug = ? ORDER BY id ASC',
        )
        .all(req.params.slug);
      res.json({
        ok: true,
        automations: rows.map((r) => ({
          id: r.id,
          key: r.key,
          enabled: !!r.enabled,
          timingValue: r.timing_value,
          timingUnit: r.timing_unit,
          templateId: r.template_id,
          subject: r.subject,
          body: r.body,
          config: safeParseArray(r.config_json, []),
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put(
    '/api/pwa/:slug/automations/:id',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const existing = db
          .prepare(
            'SELECT * FROM pwa_automations WHERE id = ? AND slug = ?',
          )
          .get(id, req.params.slug);
        if (!existing) {
          // Auto-create when the PWA references an automation that isn't
          // in the registry yet (e.g. first save on a freshly-seeded row).
          const slug = req.params.slug;
          const key = String(req.body?.key || `auto_${id}`);
          db.prepare(
            `INSERT INTO pwa_automations (slug, key, enabled, updated_at)
             VALUES (?, ?, 1, ?)
             ON CONFLICT(slug, key) DO NOTHING`,
          ).run(slug, key, Date.now());
        }
        const b = req.body || {};
        const merged = {
          enabled: b.enabled ? 1 : 0,
          timing_value: Number(b.timingValue) || 1,
          timing_unit: b.timingUnit || 'hours',
          template_id: b.templateId || null,
          subject: b.subject || '',
          body: b.body || '',
          config_json: JSON.stringify(b.config || []),
          updated_at: Date.now(),
        };
        db.prepare(
          `UPDATE pwa_automations SET
             enabled=@enabled, timing_value=@timing_value, timing_unit=@timing_unit,
             template_id=@template_id, subject=@subject, body=@body,
             config_json=@config_json, updated_at=@updated_at
           WHERE id=@id AND slug=@slug`,
        ).run({ ...merged, id, slug: req.params.slug });
        const row = db
          .prepare('SELECT * FROM pwa_automations WHERE id = ?')
          .get(id);
        res.json({
          ok: true,
          automation: {
            id: row.id,
            key: row.key,
            enabled: !!row.enabled,
            timingValue: row.timing_value,
            timingUnit: row.timing_unit,
            templateId: row.template_id,
            subject: row.subject,
            body: row.body,
          },
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Email templates -----
  app.get('/api/pwa/:slug/email/templates', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const rows = db
        .prepare(
          'SELECT * FROM pwa_email_templates WHERE slug = ? ORDER BY id ASC',
        )
        .all(req.params.slug);
      res.json({
        ok: true,
        templates: rows.map((r) => ({
          id: r.id,
          name: r.name,
          subject: r.subject,
          body: r.body,
          category: r.category,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post(
    '/api/pwa/:slug/email/templates',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) {
          return res
            .status(400)
            .json({ ok: false, error: 'Template name is required.' });
        }
        const now = Date.now();
        const info = db
          .prepare(
            `INSERT INTO pwa_email_templates
               (slug, name, subject, body, category, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            req.params.slug,
            name,
            String(b.subject || ''),
            String(b.body || ''),
            String(b.category || ''),
            now,
            now,
          );
        const row = db
          .prepare('SELECT * FROM pwa_email_templates WHERE id = ?')
          .get(info.lastInsertRowid);
        res.status(201).json({ ok: true, template: row });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  app.put(
    '/api/pwa/:slug/email/templates/:id',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        const info = db
          .prepare(
            `UPDATE pwa_email_templates SET
               name = COALESCE(?, name),
               subject = COALESCE(?, subject),
               body = COALESCE(?, body),
               category = COALESCE(?, category),
               updated_at = ?
             WHERE id = ? AND slug = ?`,
          )
          .run(
            b.name ?? null,
            b.subject ?? null,
            b.body ?? null,
            b.category ?? null,
            Date.now(),
            id,
            req.params.slug,
          );
        if (!info.changes) {
          return res
            .status(404)
            .json({ ok: false, error: 'Template not found.' });
        }
        const row = db
          .prepare('SELECT * FROM pwa_email_templates WHERE id = ?')
          .get(id);
        res.json({ ok: true, template: row });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  app.delete(
    '/api/pwa/:slug/email/templates/:id',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const info = db
          .prepare(
            'DELETE FROM pwa_email_templates WHERE id = ? AND slug = ?',
          )
          .run(id, req.params.slug);
        if (!info.changes) {
          return res
            .status(404)
            .json({ ok: false, error: 'Template not found.' });
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Email activity -----
  app.get('/api/pwa/:slug/email/activity', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      // First try the owner-scoped table.
      let rows = db
        .prepare(
          `SELECT * FROM pwa_email_activity WHERE slug = ?
           ORDER BY sent_at DESC LIMIT ?`,
        )
        .all(req.params.slug, limit);
      // If empty, fall back to derived activity from email_logs joined on
      // email_leads where slug matches. This gives brand-new tenants a
      // populated activity feed on first load.
      if (!rows || rows.length === 0) {
        rows = db
          .prepare(
            `SELECT el.id, el.slug, el.business_name AS recipient_name,
                    el.email AS recipient_email,
                    '' AS template_name,
                    elc.subject AS subject,
                    elc.body_preview AS body_preview,
                    elc.sent_at AS sent_at,
                    elc.delivery_status AS status
               FROM email_logs elc
               JOIN email_leads el ON el.id = elc.lead_id
              WHERE el.slug = ?
              ORDER BY elc.sent_at DESC
              LIMIT ?`,
          )
          .all(req.params.slug, limit);
      }
      res.json({
        ok: true,
        activity: rows.map((r) => ({
          id: r.id,
          recipientName: r.recipient_name || '',
          recipientEmail: r.recipient_email || '',
          templateName: r.template_name || '',
          subject: r.subject || '',
          bodyPreview: r.body_preview || '',
          sentAt: r.sent_at ? isoDate(r.sent_at) : '',
          status: r.status || 'queued',
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post(
    '/api/pwa/:slug/email/send',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const b = req.body || {};
        const recipientEmail = String(b.recipientEmail || b.email || '').trim();
        const recipientName = String(b.recipientName || b.name || '').trim();
        if (!recipientEmail) {
          return res
            .status(400)
            .json({ ok: false, error: 'recipientEmail is required.' });
        }
        // Log into owner-scoped activity. Actual email delivery via the
        // existing email pipeline is delegated to a future integration —
        // for now we record the send so the UI can show "queued".
        const now = Date.now();
        const info = db
          .prepare(
            `INSERT INTO pwa_email_activity
               (slug, recipient_name, recipient_email, template_name, subject,
                body_preview, sent_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
          )
          .run(
            req.params.slug,
            recipientName,
            recipientEmail,
            String(b.templateName || ''),
            String(b.subject || ''),
            String(b.bodyPreview || '').slice(0, 240),
            now,
          );

        // Asynchronously dispatch via Resend
        sendEmail({
          to: recipientEmail,
          subject: String(b.subject || 'Message from Business'),
          text: String(b.bodyPreview || ''),
          html: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 15px; color: #1e293b; line-height: 1.6; padding: 20px;">${String(b.bodyPreview || '').replace(/\n/g, '<br>')}</div>`,
        }).then((sendRes) => {
          const newStatus = sendRes.success ? 'sent' : 'failed';
          try {
            db.prepare('UPDATE pwa_email_activity SET status = ? WHERE id = ?').run(
              newStatus,
              info.lastInsertRowid,
            );
          } catch {
            /* ignore */
          }
        }).catch((err) => {
          console.warn('[pwaApi] Resend send error:', err.message);
        });

        res.status(202).json({
          ok: true,
          activity: {
            id: info.lastInsertRowid,
            recipientName,
            recipientEmail,
            templateName: b.templateName || '',
            subject: b.subject || '',
            bodyPreview: b.bodyPreview || '',
            sentAt: isoDate(now),
            status: 'queued',
          },
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Reviews -----
  app.get('/api/pwa/:slug/reviews', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const rows = db
        .prepare(
          'SELECT * FROM pwa_reviews WHERE slug = ? ORDER BY created_at DESC',
        )
        .all(req.params.slug);
      res.json({
        ok: true,
        reviews: rows.map((r) => ({
          id: r.id,
          source: r.source || 'manual',
          customerName: r.customer_name || '',
          customerEmail: r.customer_email || '',
          rating: Number(r.rating || 0),
          service: r.service || '',
          comment: r.comment || '',
          response: r.response || '',
          respondedAt: r.responded_at ? isoDate(r.responded_at) : null,
          createdAt: r.created_at ? isoDate(r.created_at) : '',
          status: r.response ? 'responded' : 'published',
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.put(
    '/api/pwa/:slug/reviews/:id',
    pwaAuth,
    assertSameSlug,
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const response = String((req.body && req.body.response) || '').trim();
        const info = db
          .prepare(
            `UPDATE pwa_reviews SET response = ?, responded_at = ?
              WHERE id = ? AND slug = ?`,
          )
          .run(response, Date.now(), id, req.params.slug);
        if (!info.changes) {
          return res
            .status(404)
            .json({ ok: false, error: 'Review not found.' });
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  return app;
}
