// Booking data access. Thin, validated wrappers over the bookings table
// with real-time bidirectional synchronization with Supabase and SQLite.
import { db } from './db.js';
import {
  supabaseInsertBooking,
  supabaseListBookings,
  supabaseUpdateBookingStatus,
} from './supabase.js';

import { supabase as supabaseCfg } from './config.js';
import { validateBookingPayloadContract } from './bookingContractValidator.js';

const VALID_STATUS = new Set(['new', 'confirmed', 'cancelled']);
const VALID_SOURCE = new Set(['form', 'chatbot']);

const insertStmt = db.prepare(`
  INSERT INTO bookings
    (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at)
  VALUES
    (@slug, @business_name, @customer_name, @phone, @email, @service, @date, @time, @notes, @source, @status, @created_at)
`);

function extractCustomFields(input = {}) {
  const KNOWN_KEYS = new Set([
    'id', 'slug', 'businessName', 'business_name', 'customerName', 'customer_name',
    'name', 'phone', 'email', 'service', 'date', 'time', 'notes', 'source',
    'status', 'idempotencyKey', 'idempotency_key', 'createdAt', 'created_at',
    'customFields', 'custom_fields', 'rawSubmission'
  ]);
  const custom = {};
  if (input.customFields && typeof input.customFields === 'object') {
    Object.assign(custom, input.customFields);
  }
  if (input.custom_fields && typeof input.custom_fields === 'object') {
    Object.assign(custom, input.custom_fields);
  }
  Object.keys(input).forEach((k) => {
    if (!KNOWN_KEYS.has(k) && input[k] !== undefined && input[k] !== null && input[k] !== '') {
      custom[k] = input[k];
    }
  });
  return custom;
}

function rowToBooking(r) {
  let customFields = {};
  if (r.custom_fields) {
    try {
      customFields = typeof r.custom_fields === 'string' ? JSON.parse(r.custom_fields) : r.custom_fields;
    } catch {}
  } else if (r.customFields) {
    customFields = r.customFields;
  }
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
    customFields,
    createdAt: Number(r.created_at || r.createdAt || Date.now()),
  };
}

const str = (v) => (v == null ? '' : String(v)).trim();

// In-memory backing store for local/dev and deterministic tests
const localBookingsMemory = [];

// Insert a booking into local storage (with SQLite statement attempt).
export function createBooking(input = {}) {
  const validation = validateBookingPayloadContract(input);
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.status = 400;
    throw err;
  }

  const slug = str(input.slug);
  const idempotencyKey = str(input.idempotencyKey || input.idempotency_key) || null;
  if (idempotencyKey) {
    const existing = localBookingsMemory.find(b => b.slug === slug && b.idempotencyKey === idempotencyKey);
    if (existing) {
      return { ...existing, isExisting: true };
    }
  }

  const customer_name = str(input.customerName || input.name || input.customer_name);
  const phone = str(input.phone);
  const source = VALID_SOURCE.has(input.source) ? input.source : 'form';
  const id = input.id ? Number(input.id) : (Date.now() + Math.floor(Math.random() * 1000));
  const customFields = extractCustomFields(input);
  let notes = str(input.notes);
  if (!notes && Object.keys(customFields).length > 0) {
    notes = Object.entries(customFields).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' | ');
  }

  const record = {
    id,
    slug,
    business_name: str(input.businessName || input.business_name),
    customer_name,
    phone,
    email: str(input.email),
    service: str(input.service),
    date: str(input.date),
    time: str(input.time),
    notes,
    customFields,
    source,
    status: input.status || 'new',
    idempotencyKey,
    created_at: Number(input.createdAt || Date.now()),
  };
  try {
    const info = insertStmt.run(record);
    if (info && info.lastInsertRowid) {
      record.id = info.lastInsertRowid;
    }
  } catch {
    /* ignore sqlite cache error */
  }

  const formatted = { ...rowToBooking(record), idempotencyKey };
  localBookingsMemory.push(formatted);
  return formatted;
}

// Authoritative booking creation: requires durable persistence in Supabase when live.
export async function createBookingAsync(input = {}) {
  const validation = validateBookingPayloadContract(input);
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.status = 400;
    throw err;
  }

  const slug = str(input.slug);
  const customerName = str(input.customerName || input.name || input.customer_name);
  const phone = str(input.phone);
  const customFields = extractCustomFields(input);
  let notes = str(input.notes);
  if (!notes && Object.keys(customFields).length > 0) {
    notes = Object.entries(customFields).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' | ');
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
    notes,
    customFields,
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

  // Priority 1: In production, never fall back to in-memory/mock storage.
  // If database credentials are missing, connection fails, or durable write cannot be confirmed, return HTTP 503.
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction || supabaseCfg.live) {
    const err = new Error('Booking service temporarily unavailable. The database write could not be confirmed.');
    err.status = 503;
    throw err;
  }

  // Isolated development/offline fallback ONLY when NODE_ENV !== 'production' AND no live DB is configured
  console.warn('[bookings] Non-production offline mode: falling back to local storage.');
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
