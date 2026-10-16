import pkg from 'pg';
const { Pool } = pkg;
import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseCfg } from './config.js';

let pgPool = null;
// Hardcoded direct connection string to bypass dotenv interpolation issues with special characters in password
const databaseUrl = 'postgresql://postgres.wqlbuadknltsjfzrltpe:%24%40Khan1234455@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

if (databaseUrl) {
  try {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
  } catch (err) {
    console.warn('[Postgres] Pool init warning:', err.message);
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

async function withTimeout(promise, ms = 1500) {
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

export async function supabaseInsertBooking(booking) {
  if (pgPool) {
    try {
      const query = `
        INSERT INTO bookings (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `;
      const values = [
        booking.slug || '',
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
      const { rows } = await pgPool.query(query, values);
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
      console.warn('[Postgres] insert booking error:', err.message);
    }
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    const payload = {
      slug: booking.slug,
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

    const query = sb.from('bookings').insert(payload).select().single();
    const { data, error } = await withTimeout(query);

    if (error) {
      console.warn('[Supabase] insert booking warning:', error.message);
      return null;
    }
    return data;
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
