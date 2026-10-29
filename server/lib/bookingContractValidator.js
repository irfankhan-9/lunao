/**
 * Lunao Booking Beta — Deterministic Engineering Contract Validator
 * 
 * Enforces the non-negotiable contract outside of the language model:
 * 1. Allowed: Visual CSS, layout, approved service options, surrounding content.
 * 2. Prohibited: Custom booking fields, duplicated/replaced booking components,
 *    tampered endpoints/actions, inline mock success handlers, fake persistence.
 * 
 * Version: 1.0.0-beta
 */

export const BOOKING_COMPONENT_VERSION = '1.0.0-beta';

export const CONTRACT_REJECTION_MESSAGE =
  "Custom booking functionality is currently in beta and is not supported. To protect reliability, use Lunao's approved booking template with Name, Email, Phone Number and Service. You can still customize its appearance and supported service options.";

// Core approved fields for the booking template (Name, Email, Phone Number, Service, plus standard slots Date/Time/Notes)
export const APPROVED_FIELD_IDENTIFIERS = new Set([
  // Name
  'name', 'client-name', 'client_name', 'customer-name', 'customer_name', 'customername', 'fullname', 'full_name',
  // Phone
  'phone', 'client-phone', 'client_phone', 'mobile', 'tel', 'telephone', 'phone_number', 'phonenumber',
  // Email
  'email', 'client-email', 'client_email', 'email_address', 'mail',
  // Service
  'service', 'booking-service', 'booking_service', 'service-select', 'services', 'treatment',
  // Standard scheduling slots (presentation only, not custom fields)
  'date', 'booking-date', 'booking_date', 'service-date',
  'time', 'booking-time', 'booking_time', 'time-slot', 'timeslot',
  'notes', 'booking-notes', 'booking_notes', 'comments', 'special-requests'
]);

// Canonical Approved Booking Component Template (v1.0.0-beta)
export const APPROVED_BOOKING_COMPONENT_HTML = `
<!-- Lunao Approved Booking Component (v1.0.0-beta) -->
<section id="booking" class="lunao-booking-section" data-lunao-booking-version="1.0.0-beta">
  <div class="booking-container">
    <div class="booking-header">
      <span class="booking-eyebrow">RESERVE AN APPOINTMENT</span>
      <h2 class="booking-title">Book an Appointment</h2>
      <p class="booking-subtitle">Choose your preferred service and requested time. We will reach out to confirm your booking.</p>
    </div>
    <div class="booking-box" id="booking-form-container">
      <form id="appointment-form" data-lunao-booking="true" data-lunao-booking-version="1.0.0-beta" novalidate>
        <div class="form-group">
          <label class="form-label" for="client-name">Your Full Name</label>
          <input type="text" id="client-name" name="name" class="form-input" placeholder="e.g. John Doe" required autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="client-email">Email Address</label>
          <input type="email" id="client-email" name="email" class="form-input" placeholder="e.g. john@example.com" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label" for="client-phone">Mobile Phone</label>
          <input type="tel" id="client-phone" name="phone" class="form-input" placeholder="e.g. (512) 555-0199" required autocomplete="tel">
        </div>
        <div class="form-group">
          <label class="form-label" for="booking-service">Selected Service</label>
          <select id="booking-service" name="service" class="form-input" required>
            <option value="" disabled selected>— Select an Approved Service —</option>
            <option value="Standard Service Consultation">Standard Service Consultation</option>
            <option value="Premium Complete Service">Premium Complete Service</option>
            <option value="Diagnostic & Inspection">Diagnostic & Inspection</option>
          </select>
        </div>
        <div class="form-row-slots" style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="booking-date">Preferred Date</label>
            <input type="date" id="booking-date" name="date" class="form-input">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="booking-time">Preferred Time</label>
            <select id="booking-time" name="time" class="form-input">
              <option value="9:00 AM">9:00 AM</option>
              <option value="11:00 AM">11:00 AM</option>
              <option value="2:00 PM">2:00 PM</option>
              <option value="4:00 PM">4:00 PM</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="booking-notes">Special Requests (Optional)</label>
          <textarea id="booking-notes" name="notes" class="form-input" rows="2" placeholder="Any specific requirements..."></textarea>
        </div>
        <button type="submit" class="btn-submit" id="submit-appointment-btn">Request Appointment</button>
      </form>
    </div>
  </div>
</section>
`.trim();

/**
 * Normalizes an identifier string (name, id, data-attribute) for comparison
 */
function normalizeIdentifier(raw) {
  if (!raw) return '';
  return String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
}

/**
 * Deterministically extracts form tags and their input definitions from HTML.
 */
function extractBookingForms(html) {
  if (!html || typeof html !== 'string') return [];
  
  // Extract all <form ...> ... </form> blocks
  const formRegex = /<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi;
  const forms = [];
  let match;

  while ((match = formRegex.exec(html)) !== null) {
    const formTagAttrs = match[1];
    const formInnerHtml = match[2];

    const isBooking = 
      /data-lunao-booking/i.test(formTagAttrs) ||
      /id=["'](?:appointment-form|booking-form|book-form|appointmentform)["']/i.test(formTagAttrs) ||
      /class=["'][^"']*(?:booking|appointment)[^"']*["']/i.test(formTagAttrs) ||
      /booking-service|client-phone|submit-appointment-btn/i.test(formInnerHtml);

    forms.push({
      fullMatch: match[0],
      attrs: formTagAttrs,
      innerHtml: formInnerHtml,
      isBooking
    });
  }

  return forms;
}

/**
 * Validates proposed HTML against the Non-Negotiable Booking Beta Contract.
 * 
 * @param {string} proposedHtml - The AI-generated or modified HTML
 * @param {string} previousVerifiedHtml - The last verified clean HTML
 * @param {object} [options] - Validation options (e.g. allowedServices)
 * @returns {{ valid: boolean, reason?: string, customerMessage?: string }}
 */
export function validateBookingContract(proposedHtml, previousVerifiedHtml = '', options = {}) {
  if (!proposedHtml || typeof proposedHtml !== 'string') {
    return {
      valid: false,
      reason: 'Empty or invalid HTML string provided.',
      customerMessage: CONTRACT_REJECTION_MESSAGE
    };
  }

  const bookingForms = extractBookingForms(proposedHtml).filter(f => f.isBooking);

  // 1. If previous HTML had a booking form, proposed HTML must not delete or duplicate it
  const prevBookingForms = previousVerifiedHtml ? extractBookingForms(previousVerifiedHtml).filter(f => f.isBooking) : [];
  
  if (prevBookingForms.length > 0 && bookingForms.length === 0) {
    return {
      valid: false,
      reason: 'Prohibited change: Approved booking component was removed or stripped.',
      customerMessage: CONTRACT_REJECTION_MESSAGE
    };
  }

  // 2. Prohibited: Duplicating the approved booking component (>1 booking form)
  if (bookingForms.length > 1) {
    return {
      valid: false,
      reason: `Prohibited change: Duplicating booking component (${bookingForms.length} booking forms detected).`,
      customerMessage: CONTRACT_REJECTION_MESSAGE
    };
  }

  // If there's no booking form on page at all (non-booking page), it is valid
  if (bookingForms.length === 0) {
    return { valid: true };
  }

  const form = bookingForms[0];

  // 3. Prohibited: Creating alternative booking endpoints or action overrides
  const actionMatch = form.attrs.match(/\baction=["']([^"']+)["']/i);
  if (actionMatch) {
    const actionVal = actionMatch[1].trim();
    const isSafeLocal = actionVal === '' || actionVal === '#' || actionVal === '/api/bookings' || actionVal.startsWith('#');
    if (!isSafeLocal) {
      return {
        valid: false,
        reason: `Prohibited change: Alternative booking endpoint detected (${actionVal}).`,
        customerMessage: CONTRACT_REJECTION_MESSAGE
      };
    }
  }

  // 4. Prohibited: Creating or adding custom booking fields
  // Extract all <input>, <select>, <textarea> inside the booking form
  const inputRegex = /<(input|select|textarea)\b([^>]*?)>/gi;
  let inputMatch;
  const detectedFields = [];

  while ((inputMatch = inputRegex.exec(form.innerHtml)) !== null) {
    const tag = inputMatch[1].toLowerCase();
    const attrs = inputMatch[2];

    const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : (tag === 'select' ? 'select' : (tag === 'textarea' ? 'textarea' : 'text'));

    // Skip submit buttons and hidden standard tokens
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') continue;

    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const bindMatch = attrs.match(/\bdata-lunao-bind=["']([^"']+)["']/i);

    const name = normalizeIdentifier(nameMatch ? nameMatch[1] : '');
    const id = normalizeIdentifier(idMatch ? idMatch[1] : '');
    const bind = normalizeIdentifier(bindMatch ? bindMatch[1] : '');

    detectedFields.push({ tag, type, name, id, bind, rawAttrs: attrs });
  }

  for (const field of detectedFields) {
    // Check if this field maps to any approved field identifier
    const isApprovedName = field.name && APPROVED_FIELD_IDENTIFIERS.has(field.name);
    const isApprovedId = field.id && APPROVED_FIELD_IDENTIFIERS.has(field.id);
    const isApprovedType = (field.type === 'tel' || field.type === 'email');
    const isApprovedDate = (field.type === 'date' || field.type === 'time');
    const isApprovedSelect = field.tag === 'select' && (field.name.includes('service') || field.id.includes('service') || field.name.includes('time') || field.id.includes('time'));

    // Check for explicit custom binding attribute
    if (field.bind && !APPROVED_FIELD_IDENTIFIERS.has(field.bind)) {
      return {
        valid: false,
        reason: `Prohibited change: Custom booking field detected via data-lunao-bind="${field.bind}".`,
        customerMessage: CONTRACT_REJECTION_MESSAGE
      };
    }

    if (!isApprovedName && !isApprovedId && !isApprovedType && !isApprovedDate && !isApprovedSelect) {
      const fieldDesc = field.name || field.id || field.tag;
      return {
        valid: false,
        reason: `Prohibited change: Unsupported custom booking field "${fieldDesc}". Only Name, Email, Phone Number and Service are allowed.`,
        customerMessage: CONTRACT_REJECTION_MESSAGE
      };
    }
  }

  // 5. Ensure core approved fields are present: At least Name, Phone, and Service selection
  const hasName = detectedFields.some(f => f.name.includes('name') || f.id.includes('name') || f.type === 'text');
  const hasPhone = detectedFields.some(f => f.name.includes('phone') || f.id.includes('phone') || f.type === 'tel');
  const hasService = detectedFields.some(f => f.name.includes('service') || f.id.includes('service') || f.tag === 'select');

  if (!hasName || !hasPhone || !hasService) {
    return {
      valid: false,
      reason: 'Prohibited change: Approved booking component structure altered. Name, Phone, and Service selection must remain present.',
      customerMessage: CONTRACT_REJECTION_MESSAGE
    };
  }

  // 6. Prohibited: Inline script blocks inside booking section attempting mock success handlers or fake persistence
  if (/<script\b[\s\S]*?(?:localStorage\.setItem\(['"]booking|fakeBooking|mockSuccess|alert\(['"]Booking confirmed)/i.test(form.innerHtml)) {
    return {
      valid: false,
      reason: 'Prohibited change: Fake persistence or mock booking success handler detected.',
      customerMessage: CONTRACT_REJECTION_MESSAGE
    };
  }

  return { valid: true };
}

/**
 * Validates booking submission request payload against the strict Beta Contract.
 * Rejects custom fields outside the approved template schema.
 * 
 * @param {object} payload - Body passed to /api/bookings
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBookingPayloadContract(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload.' };
  }

  // Check for prohibited custom fields
  const rawCustom = payload.customFields || payload.custom_fields || {};
  const customKeys = Object.keys(rawCustom).filter(k => !APPROVED_FIELD_IDENTIFIERS.has(normalizeIdentifier(k)));
  if (customKeys.length > 0) {
    return {
      valid: false,
      error: CONTRACT_REJECTION_MESSAGE
    };
  }

  // Priority 4: Do not blindly allow rawSubmission. Validate every key inside rawSubmission
  // to prevent unapproved custom fields from bypassing schema validation.
  if (payload.rawSubmission && typeof payload.rawSubmission === 'object') {
    const rawKeys = Object.keys(payload.rawSubmission).filter(k => !APPROVED_FIELD_IDENTIFIERS.has(normalizeIdentifier(k)));
    if (rawKeys.length > 0) {
      return {
        valid: false,
        error: CONTRACT_REJECTION_MESSAGE
      };
    }
  }

  // Check for any unauthorized top-level keys
  const ALLOWED_TOP_LEVEL = new Set([
    'slug', 'businessName', 'business_name', 'customerName', 'customer_name', 'name',
    'phone', 'email', 'service', 'date', 'time', 'notes', 'source', 'status',
    'idempotencyKey', 'idempotency_key', 'createdAt', 'created_at', 'customFields', 'custom_fields',
    'rawSubmission'
  ]);

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      return {
        valid: false,
        error: CONTRACT_REJECTION_MESSAGE
      };
    }
  }

  // Required: slug
  const slug = String(payload.slug || '').trim();
  if (!slug) {
    return { valid: false, error: 'Business slug is required for tenant association.' };
  }

  // Required: customerName (min 2 chars)
  const name = String(payload.customerName || payload.name || payload.customer_name || '').trim();
  if (!name || name.length < 2) {
    return { valid: false, error: 'Full customer name (at least 2 characters) is required.' };
  }

  // Required: phone (at least 7 digits)
  const phone = String(payload.phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!phone || digits.length < 7) {
    return { valid: false, error: 'A valid telephone number (minimum 7 digits) is required.' };
  }

  // Required: service
  const service = String(payload.service || '').trim();
  if (!service) {
    return { valid: false, error: 'An approved service option must be selected.' };
  }

  // Optional: email format check if provided
  const email = String(payload.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Please provide a valid email address.' };
  }

  // Validate preferred date format if provided
  const dateStr = String(payload.date || '').trim();
  if (dateStr) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return { valid: false, error: 'Invalid preferred date. Please provide a valid calendar date in YYYY-MM-DD format.' };
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return { valid: false, error: 'Invalid preferred date.' };
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      return { valid: false, error: 'Invalid preferred date.' };
    }
  }

  // Validate preferred time format if provided
  const timeStr = String(payload.time || '').trim();
  if (timeStr) {
    const isFlexible = /^flexible$/i.test(timeStr);
    const isTime12 = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM|am|pm)$/i.test(timeStr);
    const isTime24 = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr);
    if (!isFlexible && !isTime12 && !isTime24) {
      return { valid: false, error: 'Invalid preferred time format. Please provide a standard time (e.g. 10:00 AM) or "Flexible".' };
    }
  }

  return { valid: true };
}

/**
 * Extracts legitimate approved service option tags from HTML.
 */
function extractPreservedServiceOptions(html) {
  if (!html || typeof html !== 'string') return [];
  const selectMatch = html.match(/<select\b[^>]*?(?:name|id)=["'](?:service|booking-service|booking_service)["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) return [];
  const optionRegex = /<option\b[^>]*>([\s\S]*?)<\/option>/gi;
  const options = [];
  let m;
  while ((m = optionRegex.exec(selectMatch[1])) !== null) {
    const rawOption = m[0];
    const text = m[1].trim();
    if (text && !text.includes('— Select') && !text.includes('Choose a service') && !text.includes('Select an Approved')) {
      options.push(rawOption);
    }
  }
  return options;
}

/**
 * Rollback helper: Replaces corrupted/unapproved booking sections with the canonical
 * approved Lunao booking component (v1.0.0-beta) while preserving legitimate business service
 * options, pricing, and visual styling.
 */
export function rollbackToApprovedBooking(html) {
  if (!html) return html;

  // 1. Extract legitimate business service options
  const preservedOptions = extractPreservedServiceOptions(html);
  let componentHtml = APPROVED_BOOKING_COMPONENT_HTML;

  if (preservedOptions.length > 0) {
    const optionsBlock = [
      '<option value="" disabled selected>— Select an Approved Service —</option>',
      ...preservedOptions
    ].join('\n            ');
    componentHtml = componentHtml.replace(
      /<select id="booking-service" name="service" class="form-input" required>[\s\S]*?<\/select>/i,
      `<select id="booking-service" name="service" class="form-input" required>\n            ${optionsBlock}\n          </select>`
    );
  }

  // 2. Extract existing section styling/classes if present
  const sectionClassMatch = html.match(/<section\b[^>]*?(?:id=["'](?:book|booking|appointments)["']|class=["'][^"']*(?:booking|appointment)[^"']*["'])[^>]*?\bclass=["']([^"']+)["']/i);
  if (sectionClassMatch && sectionClassMatch[1]) {
    const customClasses = sectionClassMatch[1].trim();
    componentHtml = componentHtml.replace(
      'class="lunao-booking-section"',
      `class="${customClasses}"`
    );
  }

  const bookingForms = extractBookingForms(html).filter(f => f.isBooking);
  if (bookingForms.length === 0) {
    if (html.includes('</body>')) {
      return html.replace('</body>', `${componentHtml}\n</body>`);
    }
    return `${html}\n${componentHtml}`;
  }

  const sectionRegex = /<section\b[^>]*?(?:id=["'](?:book|booking|appointments)["']|class=["'][^"']*(?:booking|appointment)[^"']*["'])[^>]*>[\s\S]*?<\/section>/i;
  if (sectionRegex.test(html)) {
    return html.replace(sectionRegex, componentHtml);
  }

  return html.replace(bookingForms[0].fullMatch, componentHtml);
}
