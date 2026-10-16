// Booking data access. Thin, validated wrappers over the bookings table
// with real-time bidirectional synchronization with Supabase and SQLite.
import { db } from './db.js';
import {
  supabaseInsertBooking,
  supabaseListBookings,
  supabaseUpdateBookingStatus,
} from './supabase.js';

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

// Insert a booking from either the form or the chatbot. Requires at minimum a
// customer name OR phone so empty noise can't pollute the dashboard.
export function createBooking(input = {}) {
  const customer_name = str(input.customerName || input.name || input.customer_name);
  const phone = str(input.phone);
  if (!customer_name && !phone) {
    const err = new Error('A name or phone number is required to book.');
    err.status = 400;
    throw err;
  }
  const source = VALID_SOURCE.has(input.source) ? input.source : 'form';
  const record = {
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
    status: 'new',
    created_at: Date.now(),
  };
  if (!record.slug) {
    const err = new Error('slug is required.');
    err.status = 400;
    throw err;
  }
  const info = insertStmt.run(record);
  const localBooking = getBooking(info.lastInsertRowid);

  // Sync to Supabase in the background
  supabaseInsertBooking(localBooking).catch((err) => {
    console.warn('[bookings] Supabase sync notice:', err.message);
  });

  return localBooking;
}

export async function createBookingAsync(input = {}) {
  const localBooking = createBooking(input);
  try {
    const sbData = await supabaseInsertBooking(localBooking);
    if (sbData) {
      return { ...localBooking, supabaseId: sbData.id };
    }
  } catch (err) {
    console.warn('[bookings] Supabase insert warning:', err.message);
  }
  return localBooking;
}

export function getBooking(id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  return row ? rowToBooking(row) : null;
}

export function listBookings(slug) {
  const rows = slug
    ? db.prepare('SELECT * FROM bookings WHERE slug = ? ORDER BY created_at DESC').all(slug)
    : db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return rows.map(rowToBooking);
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
  const info = notes !== undefined
    ? db.prepare('UPDATE bookings SET status = ?, notes = ? WHERE id = ?').run(status, String(notes || ''), id)
    : db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);

  if (info.changes === 0) {
    const err = new Error('Booking not found.');
    err.status = 404;
    throw err;
  }

  const updated = getBooking(id);

  // Sync to Supabase in the background
  supabaseUpdateBookingStatus(id, status, notes).catch((err) => {
    console.warn('[bookings] Supabase update status notice:', err.message);
  });

  return updated;
}
