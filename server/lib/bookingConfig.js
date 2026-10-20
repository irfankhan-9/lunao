/**
 * Lunao Booking Configuration & Standardization Engine
 * 
 * Manages tenant-specific booking configuration:
 * - 6 fixed internal beta fields: Name, Email, Phone, Service, Preferred Date, Preferred Time
 * - Owner-customizable field labels and approved button text
 * - Business-approved services
 * - Business hours, time intervals, and allowed time choices
 * - Configurable "Flexible" time toggle
 * - IANA timezone resolution
 * 
 * Version: 1.0.0-beta
 */

import { db } from './db.js';
import { getProfile } from './businessProfile.js';

export const APPROVED_BETA_FIELDS = [
  'name',
  'email',
  'phone',
  'service',
  'date',
  'time'
];

export const DEFAULT_BOOKING_CONFIG = {
  version: '1.0.0-beta',
  timezone: 'America/Chicago',
  buttonText: 'Request Appointment',
  fieldLabels: {
    name: 'Your Full Name',
    email: 'Email Address',
    phone: 'Mobile Phone',
    service: 'Selected Service',
    date: 'Preferred Date',
    time: 'Preferred Time',
  },
  allowedServices: [
    'Standard Consultation & Service',
    'Premium Complete Service',
    'Diagnostic & Inspection',
  ],
  hours: {
    start: '09:00',
    end: '17:00',
    intervalMinutes: 60,
  },
  allowedTimeChoices: [
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
  ],
  allowFlexibleTime: true,
};

// In-memory cache for fast lookups and dev mode
const bookingConfigsMemory = new Map();

/**
 * Validates an IANA timezone identifier string
 */
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a calendar date string (YYYY-MM-DD)
 */
export function validateCalendarDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 2020 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  // Days in month validation
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

/**
 * Validates time string format (e.g. "9:00 AM", "02:30 PM", "14:00") or "Flexible"
 */
export function validateTimeString(timeStr, allowFlexible = true, allowedChoices = []) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const clean = timeStr.trim();

  if (/^flexible$/i.test(clean)) {
    return allowFlexible;
  }

  // If specific allowed choices are enforced, check exact or case-insensitive match
  if (Array.isArray(allowedChoices) && allowedChoices.length > 0) {
    const isChoice = allowedChoices.some(
      (c) => c.trim().toLowerCase() === clean.toLowerCase()
    );
    if (isChoice) return true;
  }

  // Standard 12-hour or 24-hour pattern match
  const time12Regex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM|am|pm)$/;
  const time24Regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

  return time12Regex.test(clean) || time24Regex.test(clean);
}

/**
 * Retrieve booking configuration for a business slug, merging with profile timezone
 */
export async function getBookingConfig(slug) {
  if (!slug) return { ...DEFAULT_BOOKING_CONFIG };

  if (bookingConfigsMemory.has(slug)) {
    return { ...bookingConfigsMemory.get(slug) };
  }

  // Check database or profile
  let config = null;
  try {
    const row = db.prepare('SELECT config_json FROM booking_configs WHERE slug = ?').get(slug);
    if (row && row.config_json) {
      config = JSON.parse(row.config_json);
    }
  } catch {
    /* fallback to profile */
  }

  // Fallback / merge with business profile
  const profile = await getProfile(slug).catch(() => null);
  const tz = (profile && profile.timezone && isValidTimezone(profile.timezone))
    ? profile.timezone
    : DEFAULT_BOOKING_CONFIG.timezone;

  const merged = {
    ...DEFAULT_BOOKING_CONFIG,
    ...(config || {}),
    timezone: (config && config.timezone && isValidTimezone(config.timezone)) ? config.timezone : tz,
    fieldLabels: {
      ...DEFAULT_BOOKING_CONFIG.fieldLabels,
      ...(config?.fieldLabels || {}),
    },
  };

  bookingConfigsMemory.set(slug, merged);
  return merged;
}

/**
 * Save / update booking configuration for a business owner
 */
export async function saveBookingConfig(slug, updates = {}) {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Business slug is required.');
  }

  const existing = await getBookingConfig(slug);

  // Validate updates
  const nextConfig = {
    ...existing,
    version: '1.0.0-beta',
  };

  if (updates.buttonText && typeof updates.buttonText === 'string') {
    nextConfig.buttonText = updates.buttonText.trim().slice(0, 50);
  }

  if (updates.fieldLabels && typeof updates.fieldLabels === 'object') {
    // Labels can be customized, but ONLY for the 6 approved beta fields
    const validLabels = {};
    for (const field of APPROVED_BETA_FIELDS) {
      if (typeof updates.fieldLabels[field] === 'string' && updates.fieldLabels[field].trim()) {
        validLabels[field] = updates.fieldLabels[field].trim().slice(0, 60);
      } else {
        validLabels[field] = existing.fieldLabels[field] || DEFAULT_BOOKING_CONFIG.fieldLabels[field];
      }
    }
    nextConfig.fieldLabels = validLabels;
  }

  if (Array.isArray(updates.allowedServices)) {
    const cleaned = updates.allowedServices
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0 && s.length <= 100);
    if (cleaned.length > 0) {
      nextConfig.allowedServices = cleaned;
      nextConfig.hasCustomServices = true;
    }
  }

  if (Array.isArray(updates.allowedTimeChoices)) {
    const cleanedTimes = updates.allowedTimeChoices
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0 && validateTimeString(t, false));
    if (cleanedTimes.length > 0) {
      nextConfig.allowedTimeChoices = cleanedTimes;
    }
  }

  if (typeof updates.allowFlexibleTime === 'boolean') {
    nextConfig.allowFlexibleTime = updates.allowFlexibleTime;
  }

  if (updates.timezone && typeof updates.timezone === 'string') {
    if (isValidTimezone(updates.timezone)) {
      nextConfig.timezone = updates.timezone.trim();
    }
  }

  if (updates.hours && typeof updates.hours === 'object') {
    nextConfig.hours = {
      start: updates.hours.start || existing.hours.start,
      end: updates.hours.end || existing.hours.end,
      intervalMinutes: Number(updates.hours.intervalMinutes) || existing.hours.intervalMinutes || 60,
    };
  }

  // Persist in SQLite/in-memory
  bookingConfigsMemory.set(slug, nextConfig);
  try {
    db.prepare(`
      INSERT INTO booking_configs (slug, config_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
    `).run(slug, JSON.stringify(nextConfig), Date.now());
  } catch {
    /* fallback to memory */
  }

  return nextConfig;
}

/**
 * Validates an incoming booking submission against the authoritative business booking config.
 * 
 * @param {object} payload - Incoming submission payload
 * @param {object} config - Business booking configuration
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBookingAgainstConfig(payload, config) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload.' };
  }

  const effectiveConfig = config || DEFAULT_BOOKING_CONFIG;

  // 1. Preferred Date Validation
  const dateStr = String(payload.date || '').trim();
  if (dateStr) {
    if (!validateCalendarDate(dateStr)) {
      return {
        valid: false,
        error: 'Invalid preferred date. Please provide a valid calendar date (YYYY-MM-DD).'
      };
    }
  }

  // 2. Preferred Time Validation
  const timeStr = String(payload.time || '').trim();
  if (timeStr) {
    const isFlexible = /^flexible$/i.test(timeStr);
    if (isFlexible) {
      if (!effectiveConfig.allowFlexibleTime) {
        return {
          valid: false,
          error: 'Flexible time preference is not enabled for this business. Please pick a specific time choice.'
        };
      }
    } else {
      const isValidTime = validateTimeString(
        timeStr,
        effectiveConfig.allowFlexibleTime,
        effectiveConfig.allowedTimeChoices
      );
      if (!isValidTime) {
        return {
          valid: false,
          error: `Invalid preferred time "${timeStr}". Please select from the business's approved time slots.`
        };
      }
    }
  }

  // 3. Service Eligibility
  const service = String(payload.service || '').trim();
  if (service && effectiveConfig.hasCustomServices && Array.isArray(effectiveConfig.allowedServices) && effectiveConfig.allowedServices.length > 0) {
    const cleanSvc = service.toLowerCase().split('—')[0].split('-')[0].trim();
    const isApproved = effectiveConfig.allowedServices.some((s) => {
      const cleanApproved = s.toLowerCase().split('—')[0].split('-')[0].trim();
      return cleanApproved === cleanSvc || s.toLowerCase() === service.toLowerCase() || service.toLowerCase().includes(cleanApproved);
    });
    if (!isApproved) {
      return {
        valid: false,
        error: `The service "${service}" is not currently configured for online booking.`
      };
    }
  }

  return { valid: true };
}
