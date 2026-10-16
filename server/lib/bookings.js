// Booking data access. Thin, validated wrappers over the bookings table
// with real-time bidirectional synchronization with Supabase and SQLite.
import { db } from './db.js';
import {
  supabaseInsertBooking,
  supabaseListBookings,
  supabaseUpdateBookingStatus,
} from './supabase.js';

import { supabase as supabaseCfg } from './config.js';

const VALID_STATUS = new Set(['new', 'confirmed', 'cancelled']);
const VALID_SOURCE = new Set(['form', 'chatbot']);

const insertStmt = db.prepare(`
  INSERT INTO bookings
    (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at)
  VALUES
    (@slug, @business_name, @customer_name, @phone, @email, @service, @date, @time, @notes, @source, @status, @created_at)
`);

function rowToBooking(r) {
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.business_name || r.businessName,
    customerName: r.customer_name || r.customerName,
    phone: r.phone,
    email: r.email,
    service: r.service,
    date: r.date,
    time: r.time,
    notes: r.notes,
    source: r.source,
    status: r.status,
    createdAt: Number(r.created_at || r.createdAt || Date.now()),
  };
}

const str = (v) => (v == null ? '' : String(v)).trim();

// In-memory backing store for local/dev and deterministic tests
const localBookingsMemory = [];

// Insert a booking into local storage (with SQLite statement attempt).
export function createBooking(input = {}) {
  const customer_name = str(input.customerName || input.name || input.customer_name);
  const phone = str(input.phone);
  if (!customer_name && !phone) {
    const err = new Error('A name or phone number is required to book.');
    err.status = 400;
    throw err;
  }
  const source = VALID_SOURCE.has(input.source) ? input.source : 'form';
  const id = input.id ? Number(input.id) : (Date.now() + Math.floor(Math.random() * 1000));
  const record = {
    id,
    slug: str(input.slug),
    business_name: str(input.businessName || input.business_name),
    customer_name,
    phone,
    email: str(input.email),
    service: str(input.service),
    date: str(input.date),
    time: str(input.time),
    notes: str(input.notes),
    source,
    status: input.status || 'new',
    created_at: Number(input.createdAt || Date.now()),
  };
  if (!record.slug) {
    const err = new Error('slug is required.');
    err.status = 400;
    throw err;
  }
  try {
    const info = insertStmt.run(record);
    if (info && info.lastInsertRowid) {
      record.id = info.lastInsertRowid;
    }
  } catch {
    /* ignore sqlite cache error */
  }

  const formatted = rowToBooking(record);
  localBookingsMemory.push(formatted);
  return formatted;
}

// Authoritative booking creation: requires durable persistence in Supabase when live.
export async function createBookingAsync(input = {}) {
  const slug = str(input.slug);
  if (!slug) {
    const err = new Error('slug is required to record a booking.');
    err.status = 400;
    throw err;
  }

  const customerName = str(input.customerName || input.name || input.customer_name);
  const phone = str(input.phone);
  if (!customerName && !phone) {
    const err = new Error('A customer name or phone number is required to book.');
    err.status = 400;
    throw err;
  }

  const idempotencyKey = str(input.idempotencyKey || input.idempotency_key) || null;
  const bookingPayload = {
    slug,
    businessName: str(input.businessName || input.business_name),
    customerName,
    phone,
    email: str(input.email),
    service: str(input.service),
    date: str(input.date),
    time: str(input.time),
    notes: str(input.notes),
    source: VALID_SOURCE.has(input.source) ? input.source : 'form',
    status: 'new',
    idempotencyKey,
    createdAt: Number(input.createdAt || Date.now()),
  };

  // Authoritative write to Supabase PostgreSQL
  let sbData = null;
  try {
    sbData = await supabaseInsertBooking(bookingPayload);
  } catch (err) {
    console.error('[bookings] Supabase persistence error:', err.message);
  }

  if (sbData && sbData.id) {
    // Mirror into local SQLite cache if available
    try {
      insertStmt.run({
        slug: sbData.slug,
        business_name: sbData.businessName,
        customer_name: sbData.customerName,
        phone: sbData.phone,
        email: sbData.email,
        service: sbData.service,
        date: sbData.date,
        time: sbData.time,
        notes: sbData.notes,
        source: sbData.source,
        status: sbData.status,
        created_at: sbData.createdAt,
      });
    } catch {
      /* non-fatal cache insert */
    }
    return sbData;
  }

  // If Supabase is live/configured, persistence failure MUST throw 503 rather than returning false success
  if (supabaseCfg.live) {
    const err = new Error('Booking service temporarily unavailable. The database write could not be confirmed.');
    err.status = 503;
    throw err;
  }

  // Development/offline fallback only when no live database is configured
  console.warn('[bookings] Live database not configured; falling back to local storage.');
  return createBooking(input);
}

export function getBooking(id) {
  try {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (row) return rowToBooking(row);
  } catch {
    /* fallback to memory */
  }
  return localBookingsMemory.find((b) => String(b.id) === String(id)) || null;
}

export function listBookings(slug) {
  try {
    const rows = slug
      ? db.prepare('SELECT * FROM bookings WHERE slug = ? ORDER BY created_at DESC').all(slug)
      : db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    if (rows && rows.length > 0) return rows.map(rowToBooking);
  } catch {
    /* fallback to memory */
  }

  if (slug) {
    return localBookingsMemory.filter((b) => b.slug === slug);
  }
  return [...localBookingsMemory];
}

export async function listBookingsAsync(slug) {
  const localRows = listBookings(slug);
  try {
    const sbRows = await supabaseListBookings(slug);
    if (sbRows && sbRows.length > 0) {
      // Merge unique by phone+date+time or id
      const seen = new Set();
      const combined = [];
      for (const b of sbRows) {
        const k = `${b.phone}-${b.date}-${b.time}-${b.customerName}`;
        seen.add(k);
        combined.push(b);
      }
      for (const b of localRows) {
        const k = `${b.phone}-${b.date}-${b.time}-${b.customerName}`;
        if (!seen.has(k)) {
          combined.push(b);
        }
      }
      return combined.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (err) {
    console.warn('[bookings] Supabase list warning:', err.message);
  }
  return localRows;
}

export function updateBookingStatus(id, status, notes) {
  if (!VALID_STATUS.has(status)) {
    const err = new Error('Invalid status.');
    err.status = 400;
    throw err;
  }

  let updated = null;
  try {
    const info = notes !== undefined
      ? db.prepare('UPDATE bookings SET status = ?, notes = ? WHERE id = ?').run(status, String(notes || ''), id)
      : db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
    if (info && info.changes > 0) {
      updated = getBooking(id);
    }
  } catch {
    /* fallback to memory */
  }

  // Update in memory store
  const memIdx = localBookingsMemory.findIndex((b) => String(b.id) === String(id));
  if (memIdx !== -1) {
    localBookingsMemory[memIdx].status = status;
    if (notes !== undefined) {
      localBookingsMemory[memIdx].notes = String(notes || '');
    }
    updated = localBookingsMemory[memIdx];
  }

  if (!updated) {
    const err = new Error('Booking not found.');
    err.status = 404;
    throw err;
  }

  // Sync to Supabase in the background
  supabaseUpdateBookingStatus(id, status, notes).catch((err) => {
    console.warn('[bookings] Supabase update status notice:', err.message);
  });

  return updated;
}
