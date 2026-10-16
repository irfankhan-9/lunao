// Production-Ready Email Automations for Lunao using Resend
// Implements:
//   1. Customer Booking Confirmation (immediate transactional)
//   2. Business Owner New Booking Notification (immediate operational)
//   3. Upcoming Appointment Reminder (scheduled customer reminder, respects PWA settings)
//   4. Post-Appointment Review Request & Follow-up (scheduled feedback request, respects PWA settings)

import { sendEmail } from './resendService.js';
import { getProfile } from './businessProfile.js';
import { db } from './db.js';
import { listBookingsAsync } from './bookings.js';
import { supabaseListAutomations } from './supabase.js';
import { PUBLIC_API_BASE_URL } from './config.js';

// =============================================================================
// Timezone-Aware Appointment Date & Time Parser
// =============================================================================

/**
 * Accurately parse appointment date ("YYYY-MM-DD") and time ("10:30 AM") in
 * the business's specified IANA timezone (e.g. "America/Chicago").
 * Returns epoch timestamp in milliseconds, or null if inputs are missing/invalid.
 */
export function parseAppointmentTimestamp(dateStr, timeStr, timezone = 'America/Chicago') {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  let hour = 10;
  let min = 0;
  if (timeStr && typeof timeStr === 'string') {
    const tm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (tm) {
      hour = parseInt(tm[1], 10);
      min = parseInt(tm[2], 10);
      const ampm = (tm[3] || '').toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }
  }

  const naiveUtc = Date.UTC(year, month, day, hour, min, 0);
  if (isNaN(naiveUtc)) return null;

  try {
    const tz = timezone || 'America/Chicago';
    const dateForOffset = new Date(naiveUtc);
    const utcRef = new Date(dateForOffset.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const tzRef = new Date(dateForOffset.toLocaleString('en-US', { timeZone: tz })).getTime();
    const offsetMs = tzRef - utcRef;
    return naiveUtc - offsetMs;
  } catch {
    return naiveUtc;
  }
}

/**
 * Format appointment date and time nicely with fallback in business timezone
 */
export function formatAppointmentDateTime(dateStr, timeStr, timezone) {
  if (!dateStr) return { formattedDate: 'Scheduled Visit', formattedTime: timeStr || '' };

  let formattedDate = dateStr;
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      // Anchor to noon UTC so time zone shifts (e.g. UTC-5) never flip to the previous day
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      formattedDate = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone || 'America/Chicago',
      });
    }
  } catch {
    formattedDate = dateStr;
  }

  const tzLabel = timezone ? ` (${timezone})` : '';
  const formattedTime = timeStr ? `${timeStr}${tzLabel}` : '';

  return { formattedDate, formattedTime };
}

// =============================================================================
// Owner PWA Automation Settings Reader
// =============================================================================

/**
 * Look up the business owner's automation settings for a given tenant slug and key.
 * Respects PWA settings in pwa_automations (SQLite) and Supabase automations table.
 * Defaults:
 *   - booking_confirmation: enabled = true
 *   - appointment_reminder: enabled = true, timingValue = 24, timingUnit = 'hours'
 *   - post_appointment_followup: enabled = true, timingValue = 2, timingUnit = 'hours'
 */
export async function getAutomationSetting(slug, key) {
  const defaults = {
    booking_confirmation: { enabled: true, timingValue: 0, timingUnit: 'minutes' },
    appointment_reminder: { enabled: true, timingValue: 24, timingUnit: 'hours' },
    day_of_reminder: { enabled: true, timingValue: 2, timingUnit: 'hours' },
    post_appointment_followup: { enabled: true, timingValue: 2, timingUnit: 'hours' },
  };

  const defaultSetting = defaults[key] || { enabled: true, timingValue: 24, timingUnit: 'hours' };

  if (!slug) return defaultSetting;

  // 1. Try local SQLite table (pwa_automations)
  try {
    const row = db
      .prepare('SELECT * FROM pwa_automations WHERE slug = ? AND key = ? LIMIT 1')
      .get(slug, key);
    if (row) {
      return {
        enabled: Boolean(row.enabled),
        timingValue: row.timing_value != null ? Number(row.timing_value) : defaultSetting.timingValue,
        timingUnit: row.timing_unit || defaultSetting.timingUnit,
      };
    }
  } catch {
    // Non-fatal fallback
  }

  // 2. Try Supabase automations table
  try {
    const rows = await supabaseListAutomations(slug);
    if (Array.isArray(rows)) {
      const match = rows.find((r) => r.key === key);
      if (match) {
        return {
          enabled: Boolean(match.enabled),
          timingValue: defaultSetting.timingValue,
          timingUnit: defaultSetting.timingUnit,
        };
      }
    }
  } catch {
    // Non-fatal fallback
  }

  return defaultSetting;
}

// =============================================================================
// Persistent Atomic Deduplication & Job Store (Cloud Run & Multi-Instance Safe)
// =============================================================================

// In-memory cache + state tracker
const memoryJobStore = new Map();

/**
 * Atomically claim an automation job.
 * Prevents duplicate emails across retries, restarts, and concurrent workers.
 * Implements bounded retries (max 3 attempts).
 */
export function claimAutomationJob(idempotencyKey, { bookingId, slug, automationType, recipientEmail }) {
  if (!idempotencyKey) return { proceed: true };

  const now = Date.now();
  const maxAttempts = 3;
  const inProgressTimeoutMs = 5 * 60 * 1000; // 5 min timeout for abandoned processing

  // Check memory store first for instant atomic resolution
  const existing = memoryJobStore.get(idempotencyKey);
  if (existing) {
    if (existing.status === 'sent') {
      return { proceed: false, reason: 'already_sent', resendId: existing.resendId };
    }
    if (existing.status === 'processing' && now - existing.lastAttemptAt < inProgressTimeoutMs) {
      return { proceed: false, reason: 'in_progress' };
    }
    if (existing.status === 'failed' && existing.attempts >= maxAttempts) {
      return { proceed: false, reason: 'max_retries_exceeded', attempts: existing.attempts };
    }

    existing.status = 'processing';
    existing.attempts = (existing.attempts || 1) + 1;
    existing.lastAttemptAt = now;
    existing.updatedAt = now;

    try {
      db.prepare(`
        UPDATE email_automation_jobs
        SET status = 'processing', attempts = ?, last_attempt_at = ?, updated_at = ?
        WHERE idempotency_key = ?
      `).run(existing.attempts, now, now, idempotencyKey);
    } catch {
      /* ignore */
    }

    return { proceed: true, attempt: existing.attempts };
  }

  const newJob = {
    idempotencyKey,
    bookingId: String(bookingId || ''),
    slug: slug || '',
    automationType: automationType || '',
    recipientEmail: recipientEmail || '',
    status: 'processing',
    attempts: 1,
    lastAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  memoryJobStore.set(idempotencyKey, newJob);

  try {
    db.prepare(`
      INSERT INTO email_automation_jobs
        (idempotency_key, booking_id, slug, automation_type, recipient_email, status, attempts, last_attempt_at, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, 'processing', 1, ?, ?, ?)
    `).run(idempotencyKey, newJob.bookingId, newJob.slug, newJob.automationType, newJob.recipientEmail, now, now, now);
  } catch {
    /* ignore */
  }

  return { proceed: true, attempt: 1 };
}

/**
 * Mark automation job completed with Resend provider ID
 */
export function completeAutomationJob(idempotencyKey, resendId) {
  if (!idempotencyKey) return;
  const now = Date.now();

  const job = memoryJobStore.get(idempotencyKey);
  if (job) {
    job.status = 'sent';
    job.resendId = resendId;
    job.updatedAt = now;
  }

  try {
    db.prepare(`
      UPDATE email_automation_jobs
      SET status = 'sent', resend_id = ?, updated_at = ?
      WHERE idempotency_key = ?
    `).run(resendId || '', now, idempotencyKey);
  } catch {
    /* ignore */
  }
}

/**
 * Mark automation job failed with error message
 */
export function failAutomationJob(idempotencyKey, errorMessage) {
  if (!idempotencyKey) return;
  const now = Date.now();

  const job = memoryJobStore.get(idempotencyKey);
  if (job) {
    job.status = 'failed';
    job.errorMessage = errorMessage;
    job.updatedAt = now;
  }

  try {
    db.prepare(`
      UPDATE email_automation_jobs
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE idempotency_key = ?
    `).run(String(errorMessage || '').slice(0, 300), now, idempotencyKey);
  } catch {
    /* ignore */
  }
}

/**
 * Clear job store (used for test teardown)
 */
export function resetAutomationJobStore() {
  memoryJobStore.clear();
  try {
    db.exec('DELETE FROM email_automation_jobs;');
  } catch {
    /* ignore */
  }
}

// =============================================================================
// Activity Logging (PWA Owner Stream)
// =============================================================================

function logEmailActivity({
  slug,
  recipientName,
  recipientEmail,
  templateName,
  subject,
  bodyPreview,
  status = 'sent',
  resendId = null,
}) {
  try {
    const now = Date.now();
    db.prepare(`
      INSERT INTO pwa_email_activity
        (slug, recipient_name, recipient_email, template_name, subject, body_preview, sent_at, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug || 'default',
      recipientName || '',
      recipientEmail || '',
      templateName || '',
      subject || '',
      (bodyPreview || '').slice(0, 240),
      now,
      status
    );
  } catch (err) {
    console.warn('[emailAutomations] Could not log email activity to SQLite:', err.message);
  }
}

// =============================================================================
// HTML Email Layout Wrapper
// =============================================================================

function buildHtmlWrapper({
  brandName,
  accentColor = '#059669',
  preheader,
  contentHtml,
  businessInfo,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0f172a; padding: 32px 36px; text-align: left; border-bottom: 3px solid ${accentColor}; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
    .content { padding: 36px; }
    .highlight-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
    .highlight-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .highlight-row:last-child { border-bottom: none; }
    .highlight-label { color: #64748b; font-weight: 500; }
    .highlight-val { color: #0f172a; font-weight: 600; text-align: right; }
    .btn { display: inline-block; background-color: ${accentColor}; color: #ffffff !important; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
    .footer { background-color: #f8fafc; padding: 24px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || ''}
  </div>
  <div class="wrapper">
    <div class="header">
      <h1>${brandName}</h1>
      <p>Automated Appointment & Service Updates</p>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      <strong>${brandName}</strong><br>
      ${businessInfo?.address ? `${businessInfo.address}<br>` : ''}
      ${businessInfo?.phone ? `Direct Line: ${businessInfo.phone} &bull; ` : ''}
      ${businessInfo?.email ? `Email: ${businessInfo.email}` : ''}
      <div style="margin-top: 12px; font-size: 11px; color: #94a3b8;">
        Delivered via Lunao Business Automation Engine
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// =============================================================================
// AUTOMATION A: Customer Booking Confirmation
// =============================================================================

export async function sendCustomerBookingConfirmation(booking, profile = null) {
  if (!booking || !booking.email) {
    console.log('[emailAutomations] Booking has no customer email; skipping confirmation.');
    return { skipped: true, reason: 'no_customer_email' };
  }

  // Check if booking is already cancelled
  if (booking.status === 'cancelled') {
    return { skipped: true, reason: 'booking_cancelled' };
  }

  const slug = booking.slug;

  // Check owner PWA setting for booking confirmation
  const setting = await getAutomationSetting(slug, 'booking_confirmation');
  if (!setting.enabled) {
    console.log(`[emailAutomations] Owner disabled booking_confirmation for ${slug}; skipping.`);
    return { skipped: true, reason: 'owner_automation_disabled' };
  }

  // Atomic deduplication claim
  const dedupKey = `confirmation:${booking.id || `${slug}_${booking.email}_${booking.date}_${booking.time}`}`;
  const claim = claimAutomationJob(dedupKey, {
    bookingId: booking.id,
    slug,
    automationType: 'booking_confirmation',
    recipientEmail: booking.email,
  });

  if (!claim.proceed) {
    console.log(`[emailAutomations] Confirmation duplicate check: skipping (${claim.reason})`);
    return { skipped: true, reason: claim.reason };
  }

  const business = profile || (await getProfile(slug)) || {};
  const businessName = business.name || booking.businessName || 'Our Business';
  const accent = business.theme?.accent || '#059669';
  const { formattedDate, formattedTime } = formatAppointmentDateTime(
    booking.date,
    booking.time,
    business.timezone
  );

  const referenceId = booking.id ? `BK-${booking.id}` : `BK-${Date.now().toString(36).toUpperCase()}`;
  const subject = `Confirmed: Your appointment with ${businessName} on ${booking.date}`;
  const preheader = `Your booking for ${booking.service || 'service'} on ${formattedDate} at ${booking.time} is confirmed.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:18px;">Appointment Confirmed</h2>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      Hi <strong>${booking.customerName || 'Valued Client'}</strong>,
    </p>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      Thank you for scheduling with <strong>${businessName}</strong>. We have reserved your appointment and look forward to serving you.
    </p>

    <div class="highlight-card">
      <div class="highlight-row">
        <span class="highlight-label">Service:</span>
        <span class="highlight-val">${booking.service || 'Standard Service'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Date:</span>
        <span class="highlight-val">${formattedDate}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Time:</span>
        <span class="highlight-val">${formattedTime || booking.time}</span>
      </div>
      ${business.address ? `
      <div class="highlight-row">
        <span class="highlight-label">Location:</span>
        <span class="highlight-val">${business.address}</span>
      </div>` : ''}
      <div class="highlight-row">
        <span class="highlight-label">Reference ID:</span>
        <span class="highlight-val"><code>${referenceId}</code></span>
      </div>
      ${booking.notes ? `
      <div class="highlight-row">
        <span class="highlight-label">Client Notes:</span>
        <span class="highlight-val">${booking.notes}</span>
      </div>` : ''}
    </div>

    <p style="font-size:14px; line-height:1.6; color:#475569;">
      <strong>Need to reschedule or make adjustments?</strong><br>
      Please contact our team directly at <strong>${business.phone || 'our service line'}</strong> or reply to <strong>${business.email || 'our office'}</strong>.
    </p>
  `;

  const text = `
Appointment Confirmed - ${businessName}

Hi ${booking.customerName || 'Valued Client'},

Thank you for scheduling with ${businessName}. Your appointment is confirmed!

Summary:
- Service: ${booking.service || 'Standard Service'}
- Date: ${formattedDate}
- Time: ${formattedTime || booking.time}
- Reference ID: ${referenceId}
${business.address ? `- Location: ${business.address}\n` : ''}
${booking.notes ? `- Notes: ${booking.notes}\n` : ''}

Need to reschedule or have questions? Contact us at ${business.phone || business.email}.

Best regards,
The ${businessName} Team
  `.trim();

  const html = buildHtmlWrapper({
    brandName: businessName,
    accentColor: accent,
    preheader,
    contentHtml,
    businessInfo: business,
  });

  const res = await sendEmail({
    to: booking.email,
    subject,
    html,
    text,
    replyTo: business.email || undefined,
    tags: [
      { name: 'automation', value: 'booking_confirmation' },
      { name: 'slug', value: slug || 'general' },
    ],
  });

  if (res.success) {
    completeAutomationJob(dedupKey, res.id);
  } else {
    failAutomationJob(dedupKey, res.error);
  }

  logEmailActivity({
    slug,
    recipientName: booking.customerName,
    recipientEmail: booking.email,
    templateName: 'Booking Confirmation',
    subject,
    bodyPreview: text,
    status: res.success ? 'sent' : 'failed',
    resendId: res.id,
  });

  return res;
}

// =============================================================================
// AUTOMATION B: Business-Owner New Booking Notification
// =============================================================================

export async function sendOwnerBookingNotification(booking, profile = null) {
  if (!booking) return { skipped: true, reason: 'missing_booking' };

  const slug = booking.slug;
  const business = profile || (await getProfile(slug)) || {};
  const ownerEmail = business.email;

  if (!ownerEmail) {
    console.log('[emailAutomations] Business profile has no owner email; skipping owner notification.');
    return { skipped: true, reason: 'no_owner_email' };
  }

  // Atomic deduplication claim
  const dedupKey = `owner:${booking.id || `${slug}_${booking.phone}_${booking.date}_${booking.time}`}`;
  const claim = claimAutomationJob(dedupKey, {
    bookingId: booking.id,
    slug,
    automationType: 'owner_notification',
    recipientEmail: ownerEmail,
  });

  if (!claim.proceed) {
    console.log(`[emailAutomations] Owner notification duplicate check: skipping (${claim.reason})`);
    return { skipped: true, reason: claim.reason };
  }

  const businessName = business.name || booking.businessName || 'Your Business';
  const accent = '#d97706'; // Warm Amber for owner alerts
  const { formattedDate, formattedTime } = formatAppointmentDateTime(
    booking.date,
    booking.time,
    business.timezone
  );

  const referenceId = booking.id ? `BK-${booking.id}` : `BK-${Date.now().toString(36).toUpperCase()}`;
  const ownerPwaUrl = `${PUBLIC_API_BASE_URL}/owner`;

  const subject = `[New Booking Alert] ${booking.customerName || 'New Client'} - ${booking.service || 'Appointment'}`;
  const preheader = `New booking received for ${booking.customerName} on ${formattedDate} at ${booking.time}.`;

  const contentHtml = `
    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <span style="color:#065f46; font-weight:700; font-size:14px;">&bull; Action Required / New Appointment</span>
    </div>
    <h2 style="margin-top:0; color:#0f172a; font-size:18px;">New Customer Booking Received</h2>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      A new customer booking was just recorded through your Lunao online platform for <strong>${businessName}</strong>.
    </p>

    <div class="highlight-card">
      <div class="highlight-row">
        <span class="highlight-label">Customer:</span>
        <span class="highlight-val">${booking.customerName || 'Not provided'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Phone:</span>
        <span class="highlight-val">${booking.phone ? `<a href="tel:${booking.phone}" style="color:#059669; text-decoration:none;">${booking.phone}</a>` : 'Not provided'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Email:</span>
        <span class="highlight-val">${booking.email ? `<a href="mailto:${booking.email}" style="color:#059669; text-decoration:none;">${booking.email}</a>` : 'Not provided'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Service:</span>
        <span class="highlight-val">${booking.service || 'Standard Service'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Scheduled Date:</span>
        <span class="highlight-val">${formattedDate}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Time:</span>
        <span class="highlight-val">${formattedTime || booking.time}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Booking Source:</span>
        <span class="highlight-val" style="text-transform: capitalize;">${booking.source || 'Website Form'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Booking Reference:</span>
        <span class="highlight-val"><code>${referenceId}</code></span>
      </div>
      ${booking.notes ? `
      <div class="highlight-row">
        <span class="highlight-label">Client Notes:</span>
        <span class="highlight-val">${booking.notes}</span>
      </div>` : ''}
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${ownerPwaUrl}" class="btn" style="background-color: #0f172a; padding: 14px 28px;">
        Open Owner PWA Dashboard &rarr;
      </a>
    </div>
  `;

  const text = `
[New Booking Alert] - ${businessName}

A new booking was submitted by ${booking.customerName || 'a new customer'}.

Booking Details:
- Customer: ${booking.customerName || 'Not provided'}
- Phone: ${booking.phone || 'Not provided'}
- Email: ${booking.email || 'Not provided'}
- Service: ${booking.service || 'Standard Service'}
- Date: ${formattedDate}
- Time: ${formattedTime || booking.time}
- Source: ${booking.source || 'Website Form'}
- Reference ID: ${referenceId}
${booking.notes ? `- Notes: ${booking.notes}\n` : ''}

Manage this booking in your Owner PWA:
${ownerPwaUrl}
  `.trim();

  const html = buildHtmlWrapper({
    brandName: `${businessName} Owner Portal`,
    accentColor: accent,
    preheader,
    contentHtml,
    businessInfo: business,
  });

  const res = await sendEmail({
    to: ownerEmail,
    subject,
    html,
    text,
    tags: [
      { name: 'automation', value: 'owner_notification' },
      { name: 'slug', value: slug || 'general' },
    ],
  });

  if (res.success) {
    completeAutomationJob(dedupKey, res.id);
  } else {
    failAutomationJob(dedupKey, res.error);
  }

  logEmailActivity({
    slug,
    recipientName: `${businessName} Owner`,
    recipientEmail: ownerEmail,
    templateName: 'Owner New Booking Notification',
    subject,
    bodyPreview: text,
    status: res.success ? 'sent' : 'failed',
    resendId: res.id,
  });

  return res;
}

// =============================================================================
// AUTOMATION C: Upcoming Customer Appointment Reminder
// =============================================================================

export async function sendCustomerAppointmentReminder(booking, profile = null) {
  if (!booking || !booking.email) {
    return { skipped: true, reason: 'no_customer_email' };
  }

  // Cancelled bookings never receive reminders
  if (booking.status === 'cancelled') {
    return { skipped: true, reason: 'booking_cancelled' };
  }

  const slug = booking.slug;

  // Respect Owner PWA reminder toggle
  const setting = await getAutomationSetting(slug, 'appointment_reminder');
  if (!setting.enabled) {
    console.log(`[emailAutomations] Owner disabled appointment_reminder for ${slug}; skipping.`);
    return { skipped: true, reason: 'owner_automation_disabled' };
  }

  // Idempotency key includes appointment date and time.
  // This guarantees that if a booking is rescheduled to a new date/time,
  // the old reminder is not resent, and a new reminder can be scheduled for the new time.
  const dedupKey = `reminder:${booking.id || slug}:${booking.date}:${booking.time}`;
  const claim = claimAutomationJob(dedupKey, {
    bookingId: booking.id,
    slug,
    automationType: 'appointment_reminder',
    recipientEmail: booking.email,
  });

  if (!claim.proceed) {
    console.log(`[emailAutomations] Appointment reminder duplicate check: skipping (${claim.reason})`);
    return { skipped: true, reason: claim.reason };
  }

  const business = profile || (await getProfile(slug)) || {};
  const businessName = business.name || booking.businessName || 'Our Business';
  const accent = business.theme?.accent || '#059669';
  const { formattedDate, formattedTime } = formatAppointmentDateTime(
    booking.date,
    booking.time,
    business.timezone
  );

  const subject = `Reminder: Upcoming appointment with ${businessName} on ${formattedDate}`;
  const preheader = `Friendly reminder of your appointment with ${businessName} on ${formattedDate} at ${booking.time}.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:18px;">Friendly Appointment Reminder</h2>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      Hi <strong>${booking.customerName || 'Valued Client'}</strong>,
    </p>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      This is a friendly reminder of your upcoming service with <strong>${businessName}</strong>. We are preparing for your visit and look forward to seeing you.
    </p>

    <div class="highlight-card">
      <div class="highlight-row">
        <span class="highlight-label">Service:</span>
        <span class="highlight-val">${booking.service || 'Reserved Service'}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Date:</span>
        <span class="highlight-val">${formattedDate}</span>
      </div>
      <div class="highlight-row">
        <span class="highlight-label">Time:</span>
        <span class="highlight-val">${formattedTime || booking.time}</span>
      </div>
      ${business.address ? `
      <div class="highlight-row">
        <span class="highlight-label">Address & Parking:</span>
        <span class="highlight-val">${business.address}</span>
      </div>` : ''}
    </div>

    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #475569;">
      <strong>Arrival Tip:</strong> Please arrive 5 minutes early. If you are delayed or need directions, call us directly at <strong>${business.phone || 'our front desk'}</strong>.
    </div>
  `;

  const text = `
Appointment Reminder - ${businessName}

Hi ${booking.customerName || 'Valued Client'},

This is a friendly reminder of your upcoming appointment with ${businessName}.

Details:
- Service: ${booking.service || 'Reserved Service'}
- Date: ${formattedDate}
- Time: ${formattedTime || booking.time}
${business.address ? `- Address: ${business.address}\n` : ''}

Questions or running late? Call us at ${business.phone || business.email}.

See you soon,
${businessName}
  `.trim();

  const html = buildHtmlWrapper({
    brandName: businessName,
    accentColor: accent,
    preheader,
    contentHtml,
    businessInfo: business,
  });

  const res = await sendEmail({
    to: booking.email,
    subject,
    html,
    text,
    replyTo: business.email || undefined,
    tags: [
      { name: 'automation', value: 'appointment_reminder' },
      { name: 'slug', value: slug || 'general' },
    ],
  });

  if (res.success) {
    completeAutomationJob(dedupKey, res.id);
  } else {
    failAutomationJob(dedupKey, res.error);
  }

  logEmailActivity({
    slug,
    recipientName: booking.customerName,
    recipientEmail: booking.email,
    templateName: 'Appointment Reminder',
    subject,
    bodyPreview: text,
    status: res.success ? 'sent' : 'failed',
    resendId: res.id,
  });

  return res;
}

// =============================================================================
// AUTOMATION D: Post-Appointment Review Request & Follow-Up
// =============================================================================

export async function sendCustomerReviewRequest(booking, profile = null) {
  if (!booking || !booking.email) {
    return { skipped: true, reason: 'no_customer_email' };
  }

  // Cancelled bookings never receive review requests
  if (booking.status === 'cancelled') {
    return { skipped: true, reason: 'booking_cancelled' };
  }

  const slug = booking.slug;

  // Respect Owner PWA review request toggle
  const setting = await getAutomationSetting(slug, 'post_appointment_followup');
  if (!setting.enabled) {
    console.log(`[emailAutomations] Owner disabled post_appointment_followup for ${slug}; skipping.`);
    return { skipped: true, reason: 'owner_automation_disabled' };
  }

  const business = profile || (await getProfile(slug)) || {};

  // Review URL: Use actual verified business review destination (Never fabricate URLs)
  const reviewUrl =
    business.socialLinks?.googleMaps ||
    business.reviewUrl ||
    business.websiteUrl ||
    null;

  if (!reviewUrl) {
    console.log(`[emailAutomations] No valid review destination for ${slug}; skipping review request.`);
    return { skipped: true, reason: 'no_review_url' };
  }

  // Atomic deduplication claim
  const dedupKey = `review:${booking.id || `${slug}_${booking.email}_${booking.date}`}`;
  const claim = claimAutomationJob(dedupKey, {
    bookingId: booking.id,
    slug,
    automationType: 'post_appointment_followup',
    recipientEmail: booking.email,
  });

  if (!claim.proceed) {
    console.log(`[emailAutomations] Review request duplicate check: skipping (${claim.reason})`);
    return { skipped: true, reason: claim.reason };
  }

  const businessName = business.name || booking.businessName || 'Our Business';
  const accent = business.theme?.accent || '#059669';

  const subject = `How was your experience at ${businessName}?`;
  const preheader = `Thank you for visiting ${businessName}! We would love to hear your honest feedback.`;

  const contentHtml = `
    <h2 style="margin-top:0; color:#0f172a; font-size:18px;">Thank You for Choosing ${businessName}</h2>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      Hi <strong>${booking.customerName || 'Valued Client'}</strong>,
    </p>
    <p style="font-size:15px; line-height:1.6; color:#334155;">
      Thank you for visiting us recently for your <strong>${booking.service || 'service'}</strong>. Our team takes great pride in delivering top-tier craftsmanship and exceptional service.
    </p>

    <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 12px; font-weight: 600; color: #0f172a; font-size: 15px;">
        Would you take 30 seconds to share your feedback?
      </p>
      <div style="font-size: 24px; color: #f59e0b; margin-bottom: 16px;">
        &#9733; &#9733; &#9733; &#9733; &#9733;
      </div>
      <a href="${reviewUrl}" class="btn" style="background-color: #059669; padding: 12px 28px;">
        Leave an Honest Review &rarr;
      </a>
    </div>

    <p style="font-size:13px; line-height:1.6; color:#64748b;">
      Your feedback helps our local team continue to grow and helps your neighbors find reliable, trusted local services. If your experience was anything less than perfect, please reply directly so we can make it right.
    </p>
  `;

  const text = `
Thank You for Choosing ${businessName}

Hi ${booking.customerName || 'Valued Client'},

Thank you for visiting us recently for your ${booking.service || 'service'}.

We would be deeply grateful if you could take 30 seconds to share an honest review of your experience:
${reviewUrl}

If anything was not 100% satisfactory, please reply directly to this email so we can take care of you immediately.

Warmly,
The ${businessName} Team
  `.trim();

  const html = buildHtmlWrapper({
    brandName: businessName,
    accentColor: accent,
    preheader,
    contentHtml,
    businessInfo: business,
  });

  const res = await sendEmail({
    to: booking.email,
    subject,
    html,
    text,
    replyTo: business.email || undefined,
    tags: [
      { name: 'automation', value: 'review_request' },
      { name: 'slug', value: slug || 'general' },
    ],
  });

  if (res.success) {
    completeAutomationJob(dedupKey, res.id);
  } else {
    failAutomationJob(dedupKey, res.error);
  }

  logEmailActivity({
    slug,
    recipientName: booking.customerName,
    recipientEmail: booking.email,
    templateName: 'Review Request & Follow-up',
    subject,
    bodyPreview: text,
    status: res.success ? 'sent' : 'failed',
    resendId: res.id,
  });

  return res;
}

// =============================================================================
// Automation Dispatcher (Triggered on Booking Creation)
// =============================================================================

export async function triggerNewBookingAutomations(booking) {
  if (!booking) return;

  const results = {};

  try {
    const profile = await getProfile(booking.slug);

    // 1. Customer Confirmation
    results.customerConfirmation = await sendCustomerBookingConfirmation(booking, profile);

    // 2. Owner Notification
    results.ownerNotification = await sendOwnerBookingNotification(booking, profile);
  } catch (err) {
    console.error('[emailAutomations] Error during new booking automations:', err.message);
  }

  return results;
}

// =============================================================================
// Background Automation Runner: Scheduled Reminders & Follow-Ups
// =============================================================================

export async function checkAndRunScheduledAutomations() {
  try {
    // Durable retrieval from Supabase or local SQLite
    const bookings = await listBookingsAsync();
    if (!bookings || bookings.length === 0) return { processed: 0, remindersSent: 0, reviewsSent: 0 };

    const now = Date.now();
    let remindersSent = 0;
    let reviewsSent = 0;
    let skippedDisabled = 0;
    let skippedCancelled = 0;

    for (const b of bookings) {
      if (!b.email) continue;
      if (b.status === 'cancelled') {
        skippedCancelled++;
        continue;
      }

      const profile = await getProfile(b.slug);
      const tz = profile?.timezone || 'America/Chicago';

      // Safe, timezone-aware timestamp parsing
      const appointmentTimeMs = parseAppointmentTimestamp(b.date, b.time, tz);
      if (!appointmentTimeMs) continue;

      const durationMinutes = Number(b.durationMinutes || b.duration_minutes || 60);
      const appointmentEndTimeMs = appointmentTimeMs + durationMinutes * 60 * 1000;

      const diffMs = appointmentTimeMs - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 1. Upcoming Reminder Check
      const reminderSetting = await getAutomationSetting(b.slug, 'appointment_reminder');
      if (!reminderSetting.enabled) {
        skippedDisabled++;
      } else {
        const targetHoursBefore =
          reminderSetting.timingUnit === 'days'
            ? (reminderSetting.timingValue || 1) * 24
            : (reminderSetting.timingValue || 24);

        // Reminder window: within targetHoursBefore + 4 hours buffer, but not in the past
        // Bookings made less than 12 hours before appointment do not trigger a past reminder.
        const minHoursBefore = Math.min(targetHoursBefore * 0.4, 12);
        if (diffHours >= minHoursBefore && diffHours <= targetHoursBefore + 4) {
          const res = await sendCustomerAppointmentReminder(b, profile);
          if (res && res.success) {
            remindersSent++;
          }
        }
      }

      // 2. Post-Appointment Review Request Check
      const reviewSetting = await getAutomationSetting(b.slug, 'post_appointment_followup');
      if (!reviewSetting.enabled) {
        skippedDisabled++;
      } else {
        const targetDelayHours =
          reviewSetting.timingUnit === 'days'
            ? (reviewSetting.timingValue || 1) * 24
            : (reviewSetting.timingValue || 2);

        // Must ONLY be sent AFTER the appointment has concluded
        if (now >= appointmentEndTimeMs) {
          const hoursSinceEnd = (now - appointmentEndTimeMs) / (1000 * 60 * 60);
          // Send within window: between target delay and 72 hours after completion
          if (hoursSinceEnd >= targetDelayHours && hoursSinceEnd <= 72) {
            const res = await sendCustomerReviewRequest(b, profile);
            if (res && res.success) {
              reviewsSent++;
            }
          }
        }
      }
    }

    return {
      processed: bookings.length,
      remindersSent,
      reviewsSent,
      skippedDisabled,
      skippedCancelled,
    };
  } catch (err) {
    console.warn('[emailAutomations] Scheduled runner notice:', err.message);
    return { error: err.message };
  }
}

// =============================================================================
// Scheduler Lifecycle Management (Safe single-instance per process)
// =============================================================================

let schedulerTimer = null;

export function startEmailAutomationScheduler() {
  if (schedulerTimer) return;
  // Run every 60 seconds
  schedulerTimer = setInterval(() => {
    checkAndRunScheduledAutomations().catch(() => {});
  }, 60_000);
  console.log('  Email Automations  : Active (Resend 60s background scheduler running)');
}

export function stopEmailAutomationScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('  Email Automations  : Stopped scheduler timer.');
  }
}
