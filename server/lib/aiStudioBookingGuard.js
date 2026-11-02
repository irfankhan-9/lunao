/**
 * AI Website Studio Booking Guard
 * 
 * Temporarily disables booking generation in AI Website Studio.
 * Replaces any AI-generated booking form or section with an approved high-converting
 * phone/contact CTA section.
 */

export const AI_STUDIO_BOOKING_BANNER_TEXT = 'Bookings coming soon to Lunao AI Website Studio.';

export const PHONE_CTA_SECTION_HTML = `
<!-- Lunao Direct Contact & Call Section (AI Website Studio) -->
<section class="lunao-contact-section" style="padding:64px 20px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:680px;margin:0 auto;text-align:center;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:40px 24px;box-shadow:0 4px 6px rgba(0,0,0,0.03);">
    <span style="display:inline-block;padding:4px 12px;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;border-radius:20px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Contact & Inquiries</span>
    <h2 style="font-size:26px;font-weight:800;color:#0f172a;margin-bottom:12px;">Get in Touch with {{BUSINESS_NAME}}</h2>
    <p style="color:#64748b;font-size:15px;line-height:1.6;margin-bottom:28px;">For scheduling, service questions, or immediate assistance in {{CITY}}, call our team directly.</p>
    <a href="tel:{{PHONE_RAW}}" style="display:inline-flex;align-items:center;gap:8px;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px;">Call {{PHONE_DISPLAY}}</a>
  </div>
</section>
`.trim();

/**
 * Checks if HTML contains any booking form or appointment section
 */
export function hasBookingForm(html) {
  if (!html || typeof html !== 'string') return false;
  return (
    /data-lunao-booking/i.test(html) ||
    /id=["'](?:appointment-form|booking-form|book-form|booking|appointments)["']/i.test(html) ||
    /<form\b[^>]*?(?:booking|appointment)[^>]*>/i.test(html) ||
    /<section\b[^>]*?(?:id=["'](?:book|booking|appointments)["']|class=["'][^"']*(?:booking|appointment)[^"']*["'])[^>]*>/i.test(html)
  );
}

/**
 * Replaces any booking section or form with the standard telephone/contact CTA
 */
export function replaceBookingWithPhoneCta(html) {
  if (!html || typeof html !== 'string') return html;

  let sanitized = html;

  // 1. Replace entire booking sections if present
  const sectionRegex = /<section\b[^>]*?(?:id=["'](?:book|booking|appointments)["']|class=["'][^"']*(?:booking|appointment)[^"']*["'])[^>]*>[\s\S]*?<\/section>/gi;
  if (sectionRegex.test(sanitized)) {
    sanitized = sanitized.replace(sectionRegex, PHONE_CTA_SECTION_HTML);
  }

  // 2. Replace standalone booking forms if still remaining
  const formRegex = /<form\b[^>]*?(?:data-lunao-booking|id=["'](?:appointment-form|booking-form|book-form)["']|class=["'][^"']*(?:booking|appointment)[^"']*["'])[\s\S]*?<\/form>/gi;
  if (formRegex.test(sanitized)) {
    sanitized = sanitized.replace(formRegex, PHONE_CTA_SECTION_HTML);
  }

  // 3. Remove any fake inline mock persistence scripts in AI output
  sanitized = sanitized.replace(/<script\b[\s\S]*?(?:localStorage\.setItem\(['"]booking|fakeBooking|mockSuccess)[\s\S]*?<\/script>/gi, '');

  return sanitized;
}
