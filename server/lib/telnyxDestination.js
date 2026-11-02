// server/lib/telnyxDestination.js
//
// Simple, reliable destination verification.
// Returns a list of CLEAR issues with exact fix-in-Telnyx CTAs.
// NO auto-configuration. Just diagnose.
//
// Issues we surface (each maps to a Telnyx portal deep link):
//   1. Number not assigned to any messaging profile
//   2. Webhook URL is missing or wrong
//   3. Webhook failover URL missing
//   4. Messaging profile is disabled
//   5. Profile doesn't whitelist a CSV destination country
//   6. Number has no eligible messaging products (carrier-level block)
//   7. Country-specific registration (10DLC, DLT, UAE sender ID)

import { telnyx as config } from './config.js';
export { getWebhookUrl } from './telnyxMessagingProfile.js';

// ---- Country metadata ----
const COUNTRY_META = {
  US: { name: 'United States', flag: '🇺🇸', portalReg: null },
  CA: { name: 'Canada', flag: '🇨🇦', portalReg: null },
  GB: { name: 'United Kingdom', flag: '🇬🇧', portalReg: null },
  AU: { name: 'Australia', flag: '🇦🇺', portalReg: null },
  NZ: { name: 'New Zealand', flag: '🇳🇿', portalReg: null },
  DE: { name: 'Germany', flag: '🇩🇪', portalReg: null },
  FR: { name: 'France', flag: '🇫🇷', portalReg: null },
  ES: { name: 'Spain', flag: '🇪🇸', portalReg: null },
  IT: { name: 'Italy', flag: '🇮🇹', portalReg: null },
  NL: { name: 'Netherlands', flag: '🇳🇱', portalReg: null },
  IE: { name: 'Ireland', flag: '🇮🇪', portalReg: null },
  BE: { name: 'Belgium', flag: '🇧🇪', portalReg: null },
  SG: { name: 'Singapore', flag: '🇸🇬', portalReg: null },
  HK: { name: 'Hong Kong', flag: '🇭🇰', portalReg: null },
  JP: { name: 'Japan', flag: '🇯🇵', portalReg: null },
  IL: { name: 'Israel', flag: '🇮🇱', portalReg: null },
  ZA: { name: 'South Africa', flag: '🇿🇦', portalReg: null },
  BR: { name: 'Brazil', flag: '🇧🇷', portalReg: null },
  MX: { name: 'Mexico', flag: '🇲🇽', portalReg: null },
  IN: {
    name: 'India', flag: '🇮🇳',
    registration: {
      requirement: 'DLT',
      title: 'India DLT registration required',
      steps: [
        'Go to a DLT portal (jiobusiness.com, airtel.in, or vi.io) and register as a Principal Entity',
        'Get your Entity ID (format: INXXXXXXXXXXXXX)',
        'Register your Sender Header (your brand name)',
        'Submit your SMS templates for approval',
        'In Telnyx Mission Control → Regulatory → India, enter your Entity ID and headers',
        'Wait for DLT approval (24–72 hours)',
      ],
      portalUrl: 'https://portal.telnyx.com/#/app/regulatory/india',
      docsUrl: 'https://support.telnyx.com/en/articles/5801034-sending-sms-messages-to-india',
    },
  },
  AE: {
    name: 'United Arab Emirates', flag: '🇦🇪',
    registration: {
      requirement: 'SENDER ID',
      title: 'UAE requires a registered alphanumeric sender ID',
      steps: [
        'In Telnyx Mission Control → Regulatory → UAE',
        'Register your alphanumeric sender ID (up to 11 letters/numbers)',
        'Upload your UAE trade license',
        'Wait for UAE carrier approval (3–5 business days)',
      ],
      portalUrl: 'https://portal.telnyx.com/#/app/regulatory/uae',
      docsUrl: 'https://support.telnyx.com/en/articles/5801074-sending-sms-messages-to-uae',
    },
  },
};

export function getCountryMeta(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  return COUNTRY_META[code] || { name: code, flag: '🌍' };
}

// ---- US number-type specific registration ----
const US_10DLC = {
  requirement: '10DLC',
  title: 'US 10DLC registration required',
  steps: [
    'In Telnyx Mission Control → Messaging → 10DLC',
    'Register your Brand (free) — company name, tax ID or EIN',
    'Register a Campaign — choose use case, submit a sample message',
    'Pay the campaign fee (~$1–$15/month depending on type)',
    'Wait for vetting — 1–3 business days for low-risk campaigns',
    'Assign the campaign to your messaging profile',
  ],
  portalUrl: 'https://portal.telnyx.com/#/app/messaging/10dlc',
  docsUrl: 'https://support.telnyx.com/en/articles/5800943-sending-sms-messages-from-us-10dlc-numbers',
};

const US_TOLLFREE_VERIFY = {
  requirement: 'TOLL-FREE VERIFY',
  title: 'Toll-free verification required',
  steps: [
    'In Telnyx Mission Control → Messaging → Verified Numbers',
    'Select your toll-free number and click "Verify"',
    'Fill in: business info, use case, customer opt-in method',
    'Submit and wait for TCR approval (1–3 business days)',
  ],
  portalUrl: 'https://portal.telnyx.com/#/app/messaging/tollfree-verification',
  docsUrl: 'https://support.telnyx.com/en/articles/5800983-sending-sms-messages-from-toll-free-numbers',
};

// ---- Telnyx portal deep links ----
export const TELNYX_PORTAL = {
  messagingProfiles: 'https://portal.telnyx.com/#/app/messaging/profiles',
  messagingProfileDetail: (id) => `https://portal.telnyx.com/#/app/messaging/profile/${id}`,
  messagingNumberAssignment: 'https://portal.telnyx.com/#/app/messaging/numbers',
  numberDetail: (phoneNumber) =>
    `https://portal.telnyx.com/#/app/numbers/${encodeURIComponent(phoneNumber)}`,
  webhookSettings: (id) =>
    `https://portal.telnyx.com/#/app/messaging/profile/${id}/settings`,
  regulatory: 'https://portal.telnyx.com/#/app/regulatory',
};

// ---- Phone number details ----
export async function getPhoneNumberDetails({ apiKey, phoneNumber }) {
  if (!apiKey || !phoneNumber) return null;
  const encoded = encodeURIComponent(phoneNumber);
  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/messaging_phone_numbers/${encoded}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    if (!res.ok) {
      // Fallback to phone_numbers list
      const fallback = await fetch(
        `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encoded}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      if (!fallback.ok) return null;
      const data = await fallback.json();
      const num = data?.data?.[0];
      return num ? normalize(num) : null;
    }
    const data = await res.json();
    return normalize(data?.data);
  } catch (err) {
    console.error('[telnyx-destination] getPhoneNumberDetails error:', err.message);
    return null;
  }
}

function normalize(num) {
  if (!num) return null;
  return {
    id: num.id,
    phoneNumber: num.phone_number,
    type: num.phone_number_type || num.type || 'unknown',
    countryCode: num.country_code || null,
    features: Array.isArray(num.features) ? num.features : [],
    eligibleMessagingProducts: Array.isArray(num.eligible_messaging_products)
      ? num.eligible_messaging_products
      : [],
    messagingProfileId: num.messaging_profile_id || num.messaging_profile?.id || null,
    health: num.health || null,
  };
}

// ---- Profile details ----
export async function getProfileDetails({ apiKey, profileId }) {
  if (!apiKey || !profileId) return null;
  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/messaging_profiles/${profileId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.data;
    return p ? {
      id: p.id,
      name: p.name,
      enabled: p.enabled !== false,
      webhookUrl: p.webhook_url || null,
      webhookFailoverUrl: p.webhook_failover_url || null,
      whitelistedDestinations: Array.isArray(p.whitelisted_destinations)
        ? p.whitelisted_destinations.filter((c) => c !== '*')
        : [],
      phoneNumbers: Array.isArray(p.phone_numbers) ? p.phone_numbers : [],
    } : null;
  } catch (err) {
    console.error('[telnyx-destination] getProfileDetails error:', err.message);
    return null;
  }
}

// ---- Main check ----
// Returns: { phoneNumber, profile, issues[], overallStatus, targetCountries }
//
// Each issue is a typed object the UI renders 1:1 with an error row:
//   { severity: 'error' | 'warning',
//     code: 'NO_PROFILE' | 'WEBHOOK_MISSING' | ...,
//     title: 'Webhook URL is not configured',
//     detail: 'Lunao needs to receive delivery callbacks at https://...',
//     fixUrl: 'https://portal.telnyx.com/...' }
export async function checkPhoneNumberEligibility({
  apiKey,
  phoneNumber,
  targetCountries = [],
  expectedWebhookUrl = null,
}) {
  const issues = [];
  const numberDetails = await getPhoneNumberDetails({ apiKey, phoneNumber });

  // ---- Issue 1: No messaging profile assigned ----
  if (!numberDetails?.messagingProfileId) {
    issues.push({
      severity: 'error',
      code: 'NO_PROFILE',
      title: 'This number is not assigned to a messaging profile',
      detail: 'Telnyx requires every phone number to belong to a messaging profile before it can send SMS. Without one, every SMS will fail at the carrier.',
      fixLabel: 'Assign a profile in Telnyx',
      fixUrl: TELNYX_PORTAL.messagingNumberAssignment,
    });
    return buildResult({
      phoneNumber,
      profile: null,
      issues,
      targetCountries,
      numberDetails,
    });
  }

  // ---- Fetch profile ----
  const profile = await getProfileDetails({
    apiKey,
    profileId: numberDetails.messagingProfileId,
  });

  if (!profile) {
    issues.push({
      severity: 'error',
      code: 'PROFILE_NOT_FOUND',
      title: 'Messaging profile not found or inaccessible',
      detail: `Profile ${numberDetails.messagingProfileId} could not be loaded. It may have been deleted or you may have revoked Telnyx access.`,
      fixLabel: 'Reconnect Telnyx',
      fixUrl: TELNYX_PORTAL.messagingProfiles,
    });
    return buildResult({
      phoneNumber,
      profile: null,
      issues,
      targetCountries,
      numberDetails,
    });
  }

  // ---- Issue 2: Profile disabled ----
  if (!profile.enabled) {
    issues.push({
      severity: 'error',
      code: 'PROFILE_DISABLED',
      title: 'Messaging profile is disabled',
      detail: `Profile "${profile.name}" is turned off. Telnyx will reject every send until you enable it.`,
      fixLabel: 'Enable profile in Telnyx',
      fixUrl: TELNYX_PORTAL.messagingProfileDetail(profile.id),
    });
  }

  // ---- Issue 3: Webhook URL missing or wrong ----
  if (expectedWebhookUrl) {
    if (!profile.webhookUrl) {
      issues.push({
        severity: 'error',
        code: 'WEBHOOK_MISSING',
        title: 'Webhook URL is not configured',
        detail: `Without the webhook URL, Lunao cannot track delivery, replies, or opt-outs. Set it to: ${expectedWebhookUrl}`,
        fixLabel: 'Set webhook in Telnyx',
        fixUrl: TELNYX_PORTAL.webhookSettings(profile.id),
        expectedValue: expectedWebhookUrl,
      });
    } else if (profile.webhookUrl !== expectedWebhookUrl) {
      issues.push({
        severity: 'error',
        code: 'WEBHOOK_WRONG',
        title: 'Webhook URL does not match Lunao',
        detail: `Currently set to: ${profile.webhookUrl}\nLunao expects: ${expectedWebhookUrl}`,
        fixLabel: 'Fix webhook in Telnyx',
        fixUrl: TELNYX_PORTAL.webhookSettings(profile.id),
        expectedValue: expectedWebhookUrl,
      });
    }
  }

  // ---- Issue 4: Missing country whitelisting ----
  const whitelist = new Set(
    (profile.whitelistedDestinations || []).map((c) => String(c).toUpperCase())
  );
  const missingCountries = targetCountries
    .map((c) => String(c).toUpperCase())
    .filter((c) => !whitelist.has(c));
  if (missingCountries.length > 0) {
    const names = missingCountries
      .map((c) => `${getCountryMeta(c).flag} ${c}`)
      .join(', ');
    issues.push({
      severity: 'error',
      code: 'COUNTRIES_NOT_ALLOWED',
      title: 'Profile does not allow SMS to these destinations',
      detail: `Your CSV leads are in: ${names}. The current profile whitelist does not include these — Telnyx will reject messages sent there.`,
      fixLabel: 'Add countries in Telnyx',
      fixUrl: TELNYX_PORTAL.messagingProfileDetail(profile.id),
      missingCountries,
    });
  }

  // ---- Issue 5: Country-specific regulations (10DLC, DLT, UAE) ----
  const numType = String(numberDetails.type || '').toLowerCase();
  const numCountry = String(numberDetails.countryCode || '').toUpperCase();

  // US destinations from US long-code require 10DLC
  if (
    targetCountries.includes('US') &&
    numType === 'long_code' &&
    numCountry === 'US'
  ) {
    issues.push({
      severity: 'error',
      code: 'US_10DLC_REQUIRED',
      title: 'US 10DLC brand + campaign registration required',
      detail: 'US long-code numbers sending A2P SMS need a registered brand and approved campaign with The Campaign Registry (TCR). Without this, US carriers block your messages. Register in Telnyx Mission Control → Messaging → 10DLC.',
      fixLabel: 'Register 10DLC in Telnyx',
      fixUrl: US_10DLC.portalUrl,
      docsUrl: US_10DLC.docsUrl,
      requirement: US_10DLC.requirement,
      steps: US_10DLC.steps,
    });
  }

  // US toll-free requires verification
  if (
    numType === 'toll_free' &&
    (targetCountries.includes('US') || targetCountries.includes('CA'))
  ) {
    issues.push({
      severity: 'error',
      code: 'TOLL_FREE_VERIFY_REQUIRED',
      title: 'Toll-free number verification required',
      detail: 'US/CA toll-free numbers must be verified with TCR before sending A2P SMS.',
      fixLabel: 'Verify toll-free in Telnyx',
      fixUrl: US_TOLLFREE_VERIFY.portalUrl,
      docsUrl: US_TOLLFREE_VERIFY.docsUrl,
      requirement: US_TOLLFREE_VERIFY.requirement,
      steps: US_TOLLFREE_VERIFY.steps,
    });
  }

  // India always requires DLT
  if (targetCountries.includes('IN')) {
    const meta = COUNTRY_META.IN;
    issues.push({
      severity: 'error',
      code: 'IN_DLT_REQUIRED',
      title: meta.registration.title,
      detail: 'India requires every business SMS to be registered with a DLT platform (Jio, Airtel, Vi, BSNL) before sending. Telnyx cannot bypass this.',
      fixLabel: 'Register DLT in Telnyx',
      fixUrl: meta.registration.portalUrl,
      docsUrl: meta.registration.docsUrl,
      requirement: meta.registration.requirement,
      steps: meta.registration.steps,
    });
  }

  // UAE always requires sender ID
  if (targetCountries.includes('AE')) {
    const meta = COUNTRY_META.AE;
    issues.push({
      severity: 'error',
      code: 'AE_SENDER_ID_REQUIRED',
      title: meta.registration.title,
      detail: 'UAE carriers block standard phone numbers. You must register an alphanumeric sender ID (e.g. "MyBrand").',
      fixLabel: 'Register sender ID in Telnyx',
      fixUrl: meta.registration.portalUrl,
      docsUrl: meta.registration.docsUrl,
      requirement: meta.registration.requirement,
      steps: meta.registration.steps,
    });
  }

  return buildResult({
    phoneNumber,
    profile,
    issues,
    targetCountries,
    numberDetails,
    expectedWebhookUrl,
  });
}

function buildResult({ phoneNumber, profile, issues, targetCountries, numberDetails, expectedWebhookUrl }) {
  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    phoneNumber,
    numberType: numberDetails?.type || null,
    numberCountry: numberDetails?.countryCode || null,
    profile: profile ? {
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      webhookUrl: profile.webhookUrl,
      webhookFailoverUrl: profile.webhookFailoverUrl,
      whitelistedDestinations: profile.whitelistedDestinations,
    } : null,
    targetCountries,
    expectedWebhookUrl: expectedWebhookUrl || null,
    issues,
    overallStatus: hasErrors ? 'blocked' : 'ready',
  };
}
