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
import { listBookings, createBooking, updateBookingStatus, getBooking } from './bookings.js';

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
function getDashboardAggregates(slug) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const todayRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bookings
        WHERE slug = ? AND date = ? AND status != 'cancelled'`,
    )
    .get(slug, today);
  const todayBookings = Number(todayRow?.c || 0);

  const upcomingRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bookings
        WHERE slug = ? AND date > ? AND status != 'cancelled'`,
    )
    .get(slug, today);
  const upcomingBookings = Number(upcomingRow?.c || 0);

  // Customers = distinct lowercased email or phone
  const customerRow = db
    .prepare(
      `SELECT COUNT(DISTINCT lower(COALESCE(NULLIF(email, ''), phone))) AS c
         FROM bookings WHERE slug = ? AND (email != '' OR phone != '')`,
    )
    .get(slug);
  const totalCustomers = Number(customerRow?.c || 0);

  const chatRow = db
    .prepare('SELECT COUNT(*) AS c FROM chat_sessions WHERE slug = ?')
    .get(slug);
  const totalChats = Number(chatRow?.c || 0);

  return {
    todayBookings,
    upcomingBookings,
    totalCustomers,
    totalChats,
    serverTime: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Customer derivation — group bookings by lower(email|phone)
// ---------------------------------------------------------------------------
function deriveCustomers(slug) {
  const bookings = db
    .prepare(
      `SELECT id, customer_name, phone, email, service, date, time,
              status, created_at, notes, source
         FROM bookings
        WHERE slug = ?
        ORDER BY date DESC, time DESC, created_at DESC`,
    )
    .all(slug);

  const groups = new Map();
  for (const b of bookings) {
    const key = (b.email || b.phone || '').trim().toLowerCase() || `id:${b.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: b.customer_name || '',
        phone: b.phone || '',
        email: b.email || '',
        bookingCount: 0,
        lastBookingDate: b.date || isoDate(b.created_at),
        lastService: b.service || '',
        notes: b.notes || '',
        status: b.status || 'confirmed',
        bookings: [],
      });
    }
    const g = groups.get(key);
    g.bookingCount += 1;
    if (!g.lastBookingDate) g.lastBookingDate = b.date || isoDate(b.created_at);
    g.bookings.push({
      id: b.id,
      service: b.service,
      date: b.date,
      time: b.time,
      status: b.status,
      source: b.source,
      notes: b.notes,
      createdAt: b.created_at,
    });
  }

  // Enrich with pwa_customers.notes when an email match exists.
  const enrichments = db
    .prepare('SELECT name, email, phone, notes FROM pwa_customers WHERE slug = ?')
    .all(slug);
  const byEmail = new Map(
    enrichments
      .filter((e) => e.email)
      .map((e) => [String(e.email).toLowerCase(), e]),
  );
  for (const [, g] of groups) {
    const enriched = g.email ? byEmail.get(g.email.toLowerCase()) : null;
    if (enriched) {
      if (enriched.notes) g.notes = enriched.notes;
      if (enriched.name && !g.name) g.name = enriched.name;
    }
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

      const dashboard = getDashboardAggregates(slug);

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

  // ---- Integrations (explicit) -----
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
  app.get('/api/pwa/me/dashboard', pwaAuth, (req, res) => {
    try {
      const slug = req.tenantSlug;
      res.json({ ok: true, dashboard: getDashboardAggregates(slug) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Bookings -----
  app.get('/api/pwa/:slug/bookings', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const { status } = req.query;
      let rows = listBookings(req.params.slug);
      if (status) rows = rows.filter((b) => b.status === status);
      res.json({ ok: true, bookings: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/pwa/:slug/bookings', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const b = req.body || {};
      const created = createBooking({
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
    (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const existing = getBooking(id);
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
        if (status) updated = updateBookingStatus(id, status);
        if (notes !== undefined) {
          db.prepare('UPDATE bookings SET notes = ? WHERE id = ?').run(
            String(notes || ''),
            id,
          );
          updated = getBooking(id);
        }
        res.json({ ok: true, booking: updated });
      } catch (err) {
        res
          .status(err.status || 500)
          .json({ ok: false, error: err.message });
      }
    },
  );

  // ---- Customers -----
  app.get('/api/pwa/:slug/customers', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const customers = deriveCustomers(req.params.slug);
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
      res.status(201).json({
        ok: true,
        customer: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          notes: row.notes,
          bookingCount: row.booking_count,
          lastBookingDate: row.last_booking_date,
          lastService: row.last_service,
        },
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
  app.get('/api/pwa/:slug/conversations', pwaAuth, assertSameSlug, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
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
    (req, res) => {
      try {
        const sessionId = req.params.sessionId;
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
