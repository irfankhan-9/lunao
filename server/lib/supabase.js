import pkg from 'pg';
const { Pool } = pkg;
import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseCfg } from './config.js';

let pgPool = null;
const dbUrl = process.env.DATABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.PGPASSWORD;

if (dbUrl) {
  try {
    let poolConfig = {
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX) || 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    if (dbPassword) {
      try {
        const parsed = new URL(dbUrl);
        poolConfig.host = parsed.hostname;
        poolConfig.port = parsed.port ? Number(parsed.port) : 5432;
        poolConfig.user = parsed.username || 'postgres';
        poolConfig.password = dbPassword;
        poolConfig.database = parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres';
      } catch {
        poolConfig.connectionString = dbUrl;
      }
    } else {
      poolConfig.connectionString = dbUrl;
    }

    pgPool = new Pool(poolConfig);
    pgPool.on('error', (err) => {
      console.warn('[Postgres Pool Notice] Idle client error:', err.message);
    });
  } catch (err) {
    console.warn('[Supabase] Failed to initialize Postgres pool:', err.message);
    pgPool = null;
  }
}

export async function closePostgresPool() {
  if (pgPool) {
    try {
      await pgPool.end();
      pgPool = null;
    } catch (err) {
      console.warn('[Postgres] Error closing pool during shutdown:', err.message);
    }
  }
}

let client = null;

export function getSupabase() {
  if (!supabaseCfg.live) return null;
  if (!client) {
    try {
      client = createClient(supabaseCfg.url, supabaseCfg.secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (err) {
      console.warn('[Supabase] Failed to initialize client:', err.message);
      return null;
    }
  }
  return client;
}

async function withTimeout(promise, ms = 6000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Supabase query timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ---- Bookings -------------------------------------------------------------

function mapPostgresBookingRow(r, isExisting = false) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.business_name,
    customerName: r.customer_name,
    phone: r.phone,
    email: r.email,
    service: r.service,
    date: r.date,
    time: r.time,
    notes: r.notes,
    source: r.source,
    status: r.status,
    idempotencyKey: r.idempotency_key || null,
    createdAt: Number(r.created_at || Date.now()),
    isExisting,
  };
}

export async function supabaseInsertBooking(booking) {
  const idempotencyKey = booking.idempotencyKey || booking.idempotency_key || null;
  const slug = booking.slug || '';

  // 1. Primary PostgreSQL pool path
  if (pgPool) {
    try {
      // If idempotencyKey provided, check if it already exists to guarantee safe retries
      if (idempotencyKey && slug) {
        try {
          const existingRes = await pgPool.query(
            'SELECT * FROM bookings WHERE slug = $1 AND idempotency_key = $2 LIMIT 1;',
            [slug, idempotencyKey]
          );
          if (existingRes.rows && existingRes.rows.length > 0) {
            return mapPostgresBookingRow(existingRes.rows[0], true);
          }
        } catch (checkErr) {
          // If column idempotency_key does not exist yet (pending migration), ignore check
          if (checkErr.code !== '42703') {
            console.warn('[Postgres] idempotency check notice:', checkErr.message);
          }
        }
      }

      const values = [
        slug,
        booking.businessName || booking.business_name || '',
        booking.customerName || booking.customer_name || '',
        booking.phone || '',
        booking.email || '',
        booking.service || '',
        booking.date || '',
        booking.time || '',
        booking.notes || '',
        booking.source || 'form',
        booking.status || 'new',
        Number(booking.createdAt || booking.created_at || Date.now())
      ];

      let queryWithIdempotency = `
        INSERT INTO bookings (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;

      let queryWithoutIdempotency = `
        INSERT INTO bookings (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `;

      let rows;
      try {
        if (idempotencyKey) {
          const res = await pgPool.query(queryWithIdempotency, [...values, idempotencyKey]);
          rows = res.rows;
        } else {
          const res = await pgPool.query(queryWithoutIdempotency, values);
          rows = res.rows;
        }
      } catch (insertErr) {
        // Handle unique constraint conflict (concurrent submission with same idempotencyKey)
        if ((insertErr.code === '23505' || (insertErr.message && (insertErr.message.includes('unique constraint') || insertErr.message.includes('duplicate key')))) && idempotencyKey && slug) {
          const existingRes = await pgPool.query(
            'SELECT * FROM bookings WHERE slug = $1 AND idempotency_key = $2 LIMIT 1;',
            [slug, idempotencyKey]
          );
          if (existingRes.rows && existingRes.rows.length > 0) {
            return mapPostgresBookingRow(existingRes.rows[0], true);
          }
        }
        // Handle column does not exist yet error (pending migration)
        if (insertErr.code === '42703') {
          const fallbackRes = await pgPool.query(queryWithoutIdempotency, values);
          rows = fallbackRes.rows;
        } else {
          throw insertErr;
        }
      }

      if (rows && rows.length > 0) {
        return mapPostgresBookingRow(rows[0], false);
      }
    } catch (err) {
      console.warn('[Postgres] insert booking error:', err.message);
    }
  }

  // 2. HTTP Supabase client fallback
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const payload = {
      slug,
      business_name: booking.businessName || booking.business_name || '',
      customer_name: booking.customerName || booking.customer_name || '',
      phone: booking.phone || '',
      email: booking.email || '',
      service: booking.service || '',
      date: booking.date || '',
      time: booking.time || '',
      notes: booking.notes || '',
      source: booking.source || 'form',
      status: booking.status || 'new',
      created_at: booking.createdAt || booking.created_at || Date.now(),
    };
    if (idempotencyKey) {
      payload.idempotency_key = idempotencyKey;
    }

    // Check idempotency if supported
    if (idempotencyKey) {
      try {
        const { data: existing } = await withTimeout(
          sb.from('bookings').select('*').eq('slug', slug).eq('idempotency_key', idempotencyKey).maybeSingle()
        );
        if (existing) {
          return mapPostgresBookingRow(existing, true);
        }
      } catch {
        /* proceed to insert */
      }
    }

    let insertQuery = sb.from('bookings').insert(payload).select().single();
    let { data, error } = await withTimeout(insertQuery);

    // Priority 3: Handle PostgreSQL unique violation code 23505 safely by fetching matching booking.
    // NEVER remove an idempotency key and retry an insert on a uniqueness conflict!
    if (error && (error.code === '23505' || (error.message && (error.message.includes('unique constraint') || error.message.includes('duplicate key') || error.message.includes('idx_bookings_slug_idempotency'))))) {
      if (idempotencyKey && slug) {
        try {
          const { data: existing } = await withTimeout(
            sb.from('bookings').select('*').eq('slug', slug).eq('idempotency_key', idempotencyKey).maybeSingle()
          );
          if (existing) {
            return mapPostgresBookingRow(existing, true);
          }
        } catch (fetchErr) {
          console.warn('[Supabase] error fetching existing duplicate booking:', fetchErr.message);
        }
      }
      return null;
    }

    // Only if the database indicates the column itself does not exist (code 42703) do we retry without it
    if (error && (error.code === '42703' || (error.message && error.message.includes('does not exist') && error.message.includes('idempotency_key')))) {
      delete payload.idempotency_key;
      insertQuery = sb.from('bookings').insert(payload).select().single();
      const retryResult = await withTimeout(insertQuery);
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.warn('[Supabase] insert booking warning:', error.message);
      return null;
    }
    return mapPostgresBookingRow(data, false);
  } catch (err) {
    console.warn('[Supabase] insert booking error:', err.message);
    return null;
  }
}

export async function supabaseListBookings(slug) {
  if (pgPool) {
    try {
      let query = 'SELECT * FROM bookings';
      let params = [];
      if (slug) {
        query += ' WHERE slug = $1 ORDER BY created_at DESC';
        params = [slug];
      } else {
        query += ' ORDER BY created_at DESC';
      }
      const { rows } = await pgPool.query(query, params);
      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        businessName: r.business_name,
        customerName: r.customer_name,
        phone: r.phone,
        email: r.email,
        service: r.service,
        date: r.date,
        time: r.time,
        notes: r.notes,
        source: r.source,
        status: r.status,
        createdAt: Number(r.created_at || Date.now()),
      }));
    } catch (err) {
      console.warn('[Postgres] list bookings error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    let q = sb.from('bookings').select('*').order('created_at', { ascending: false });
    if (slug) {
      q = q.eq('slug', slug);
    }
    const { data, error } = await withTimeout(q);
    if (error) {
      console.warn('[Supabase] list bookings warning:', error.message);
      return null;
    }
    return (data || []).map((r) => ({
      id: r.id,
      slug: r.slug,
      businessName: r.business_name,
      customerName: r.customer_name,
      phone: r.phone,
      email: r.email,
      service: r.service,
      date: r.date,
      time: r.time,
      notes: r.notes,
      source: r.source,
      status: r.status,
      createdAt: Number(r.created_at || Date.now()),
    }));
  } catch (err) {
    console.warn('[Supabase] list bookings error:', err.message);
    return null;
  }
}

export async function supabaseUpdateBookingStatus(id, status, notes) {
  if (pgPool) {
    try {
      let query = '';
      let values = [];
      if (notes !== undefined) {
        query = 'UPDATE bookings SET status = $1, notes = $2 WHERE id = $3 RETURNING *';
        values = [status, String(notes || ''), id];
      } else {
        query = 'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *';
        values = [status, id];
      }
      const { rows } = await pgPool.query(query, values);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        slug: r.slug,
        businessName: r.business_name,
        customerName: r.customer_name,
        phone: r.phone,
        email: r.email,
        service: r.service,
        date: r.date,
        time: r.time,
        notes: r.notes,
        source: r.source,
        status: r.status,
        createdAt: Number(r.created_at || Date.now()),
      };
    } catch (err) {
      console.warn('[Postgres] update booking error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    const patch = { status };
    if (notes !== undefined) patch.notes = notes;

    const query = sb.from('bookings').update(patch).eq('id', id).select().single();
    const { data, error } = await withTimeout(query);
    if (error) {
      console.warn('[Supabase] update booking warning:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[Supabase] update booking error:', err.message);
    return null;
  }
}

// ---- Chat & Conversations --------------------------------------------------

export async function supabaseSaveChatMessage(sessionId, slug, role, content) {
  if (pgPool) {
    try {
      await pgPool.query(
        'INSERT INTO chat_sessions (id, slug, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [sessionId, slug, Date.now()]
      );
      const { rows } = await pgPool.query(
        'INSERT INTO chat_messages (session_id, slug, role, content, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [sessionId, slug, role, content, Date.now()]
      );
      return rows[0];
    } catch (err) {
      console.warn('[Postgres] save chat message error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    await withTimeout(
      sb.from('chat_sessions').upsert({
        id: sessionId,
        slug,
        created_at: Date.now(),
      }, { onConflict: 'id' })
    ).catch(() => null);

    const { data, error } = await withTimeout(
      sb.from('chat_messages').insert({
        session_id: sessionId,
        slug,
        role,
        content,
        created_at: Date.now(),
      }).select().single()
    );

    if (error) {
      console.warn('[Supabase] save chat message warning:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[Supabase] save chat message error:', err.message);
    return null;
  }
}

export async function supabaseListConversations(slug, limit = 50) {
  if (pgPool) {
    try {
      const { rows } = await pgPool.query(`
        SELECT s.id, s.slug, s.created_at,
               (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id ASC LIMIT 1) as first_msg,
               (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) as last_msg,
               (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as msg_count
        FROM chat_sessions s
        WHERE s.slug = $1
        ORDER BY s.created_at DESC
        LIMIT $2
      `, [slug, limit]);

      return rows.map((s) => ({
        id: s.id,
        slug: s.slug,
        createdAt: Number(s.created_at || Date.now()),
        firstMessage: s.first_msg || '',
        lastMessage: s.last_msg || '',
        messageCount: Number(s.msg_count || 0),
        timestamp: new Date(Number(s.created_at || Date.now())).toISOString().slice(0, 10),
      }));
    } catch (err) {
      console.warn('[Postgres] list conversations error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    const q = sb
      .from('chat_sessions')
      .select('id, slug, created_at, chat_messages(content, role, created_at)')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data, error } = await withTimeout(q);
    if (error) {
      console.warn('[Supabase] list conversations warning:', error.message);
      return null;
    }

    return (data || []).map((s) => {
      const msgs = s.chat_messages || [];
      const first = msgs[0]?.content || '';
      const last = msgs[msgs.length - 1]?.content || '';
      return {
        id: s.id,
        slug: s.slug,
        createdAt: Number(s.created_at || Date.now()),
        firstMessage: first,
        lastMessage: last,
        messageCount: msgs.length,
        timestamp: new Date(Number(s.created_at || Date.now())).toISOString().slice(0, 10),
      };
    });
  } catch (err) {
    console.warn('[Supabase] list conversations error:', err.message);
    return null;
  }
}

export async function supabaseGetConversationMessages(sessionId, slug) {
  if (pgPool) {
    try {
      let query = 'SELECT * FROM chat_messages WHERE session_id = $1';
      let params = [sessionId];
      if (slug) {
        query += ' AND slug = $2';
        params.push(slug);
      }
      query += ' ORDER BY id ASC';
      const { rows } = await pgPool.query(query, params);
      return rows.map((m) => ({
        id: m.id,
        sender: m.role === 'assistant' ? 'ai' : 'visitor',
        text: m.content,
        timestamp: new Date(Number(m.created_at || Date.now())).toISOString().slice(0, 10),
        createdAt: Number(m.created_at || Date.now()),
      }));
    } catch (err) {
      console.warn('[Postgres] get messages error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    let q = sb
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('id', { ascending: true });

    if (slug) {
      q = q.eq('slug', slug);
    }

    const { data, error } = await withTimeout(q);
    if (error) {
      console.warn('[Supabase] get messages warning:', error.message);
      return null;
    }

    return (data || []).map((m) => ({
      id: m.id,
      sender: m.role === 'assistant' ? 'ai' : 'visitor',
      text: m.content,
      timestamp: new Date(Number(m.created_at || Date.now())).toISOString().slice(0, 10),
      createdAt: Number(m.created_at || Date.now()),
    }));
  } catch (err) {
    console.warn('[Supabase] get messages error:', err.message);
    return null;
  }
}

// ---- Customers & Automations ------------------------------------------------

export async function supabaseListCustomers(slug) {
  if (pgPool) {
    try {
      const { rows } = await pgPool.query(
        'SELECT * FROM customers WHERE slug = $1 ORDER BY created_at DESC',
        [slug]
      );
      return rows;
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await withTimeout(
      sb.from('customers').select('*').eq('slug', slug).order('created_at', { ascending: false })
    );
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function supabaseInsertCustomer(customer) {
  if (pgPool) {
    try {
      const { rows } = await pgPool.query(
        'INSERT INTO customers (slug, name, phone, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [customer.slug, customer.name, customer.phone || '', customer.email || '', Date.now(), Date.now()]
      );
      return rows[0];
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await withTimeout(
      sb.from('customers').insert({
        slug: customer.slug,
        name: customer.name,
        phone: customer.phone || '',
        email: customer.email || '',
        created_at: Date.now(),
        updated_at: Date.now(),
      }).select().single()
    );
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function supabaseListAutomations(slug) {
  if (pgPool) {
    try {
      const { rows } = await pgPool.query(
        'SELECT * FROM automations WHERE slug = $1 ORDER BY id ASC',
        [slug]
      );
      return rows;
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await withTimeout(
      sb.from('automations').select('*').eq('slug', slug).order('id', { ascending: true })
    );
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function supabaseToggleAutomation(slug, key, enabled) {
  if (pgPool) {
    try {
      const { rows } = await pgPool.query(
        `INSERT INTO automations (slug, key, enabled, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug, key) DO UPDATE SET enabled = $3, updated_at = $4
         RETURNING *`,
        [slug, key, Boolean(enabled), Date.now()]
      );
      return rows[0];
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await withTimeout(
      sb.from('automations').upsert({
        slug,
        key,
        enabled: Boolean(enabled),
        updated_at: Date.now(),
      }, { onConflict: 'slug,key' }).select().single()
    );
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// ---- Email Automation Jobs (Durable Outbox & Deduplication) -----------------

let jobsTableChecked = false;
async function ensureJobsTable() {
  if (jobsTableChecked) return;
  if (pgPool) {
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS email_automation_jobs (
          idempotency_key TEXT PRIMARY KEY,
          booking_id TEXT,
          slug TEXT,
          automation_type TEXT,
          recipient_email TEXT,
          status TEXT DEFAULT 'processing',
          attempts INT DEFAULT 1,
          last_attempt_at BIGINT,
          resend_id TEXT,
          error_message TEXT,
          created_at BIGINT,
          updated_at BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_email_jobs_slug_status ON email_automation_jobs (slug, status);
      `);
      jobsTableChecked = true;
    } catch (err) {
      console.warn('[Postgres] email_automation_jobs table notice:', err.message);
    }
  }
}

export async function supabaseClaimJob(idempotencyKey, { bookingId, slug, automationType, recipientEmail }) {
  if (!idempotencyKey) return { proceed: true };
  await ensureJobsTable();

  const now = Date.now();
  const maxAttempts = 3;
  const inProgressTimeoutMs = 5 * 60 * 1000;

  if (pgPool) {
    try {
      // 1. Atomic insert with ON CONFLICT DO NOTHING
      const insertResult = await pgPool.query(
        `INSERT INTO email_automation_jobs
           (idempotency_key, booking_id, slug, automation_type, recipient_email, status, attempts, last_attempt_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'processing', 1, $6, $6, $6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING attempts`,
        [idempotencyKey, String(bookingId || ''), slug || '', automationType || '', recipientEmail || '', now]
      );

      // Successfully claimed on initial attempt
      if (insertResult.rows && insertResult.rows.length > 0) {
        return { proceed: true, attempt: 1 };
      }

      // 2. Job already exists: inspect current status
      const { rows } = await pgPool.query(
        'SELECT * FROM email_automation_jobs WHERE idempotency_key = $1 LIMIT 1',
        [idempotencyKey]
      );

      if (!rows || rows.length === 0) {
        return { proceed: false, reason: 'in_progress' };
      }

      const existing = rows[0];
      if (existing.status === 'sent') {
        return { proceed: false, reason: 'already_sent', resendId: existing.resend_id };
      }
      if (existing.status === 'processing' && now - Number(existing.last_attempt_at || 0) < inProgressTimeoutMs) {
        return { proceed: false, reason: 'in_progress' };
      }
      if (existing.status === 'failed' && Number(existing.attempts || 0) >= maxAttempts) {
        return { proceed: false, reason: 'max_retries_exceeded', attempts: Number(existing.attempts) };
      }

      // 3. Atomically claim retry lock
      const nextAttempts = Number(existing.attempts || 1) + 1;
      const updateResult = await pgPool.query(
        `UPDATE email_automation_jobs
         SET status = 'processing', attempts = $1, last_attempt_at = $2, updated_at = $2
         WHERE idempotency_key = $3
           AND (status = 'failed' OR (status = 'processing' AND last_attempt_at <= $4))
           AND attempts < $5
         RETURNING attempts`,
        [nextAttempts, now, idempotencyKey, now - inProgressTimeoutMs, maxAttempts]
      );

      if (updateResult.rows && updateResult.rows.length > 0) {
        return { proceed: true, attempt: Number(updateResult.rows[0].attempts) };
      }

      return { proceed: false, reason: 'in_progress' };
    } catch (err) {
      console.warn('[Postgres] Claim job notice:', err.message);
    }
  }

  // Fallback if no database pool connected
  return null;
}

export async function supabaseCompleteJob(idempotencyKey, resendId) {
  if (!idempotencyKey) return;
  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE email_automation_jobs
         SET status = 'sent', resend_id = $1, updated_at = $2
         WHERE idempotency_key = $3`,
        [resendId || '', Date.now(), idempotencyKey]
      );
    } catch {
      /* ignore */
    }
  }
}

export async function supabaseFailJob(idempotencyKey, errorMessage) {
  if (!idempotencyKey) return;
  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE email_automation_jobs
         SET status = 'failed', error_message = $1, updated_at = $2
         WHERE idempotency_key = $3`,
        [String(errorMessage || '').slice(0, 300), Date.now(), idempotencyKey]
      );
    } catch {
      /* ignore */
    }
  }
}
