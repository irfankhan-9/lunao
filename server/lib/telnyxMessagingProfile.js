// Telnyx Messaging Profile management.
//
// Handles programmatic creation of messaging profiles, number assignment,
// and webhook configuration for SMS campaigns.
//
// Messaging profiles are required for SMS sending - each phone number must
// be assigned to a profile that defines webhooks and geographic restrictions.

import { telnyx as config } from './config.js';

// List of supported countries for international SMS
const INTERNATIONAL_DESTINATIONS = [
  'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IN', 'BR', 'MX', 'ES',
  'IT', 'NL', 'PL', 'SE', 'NO', 'DK', 'FI', 'BE', 'AT', 'CH',
  'IE', 'NZ', 'SG', 'HK', 'JP', 'KR', 'ZA', 'AE', 'IL'
];

// Build webhook URL from public API base
function getWebhookUrl() {
  const { PUBLIC_API_BASE_URL } = config;
  return `${PUBLIC_API_BASE_URL}/api/webhooks/telnyx`;
}

/**
 * Create a new messaging profile via Telnyx API.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key (or access token)
 * @param {string} params.profileName - Friendly name for the profile
 * @param {string[]} [params.whitelistedDestinations] - ISO country codes
 * @returns {Promise<{id: string, name: string} | {error: string}>}
 */
export async function createMessagingProfile({ apiKey, profileName, whitelistedDestinations }) {
  try {
    const webhookUrl = getWebhookUrl();
    
    const res = await fetch('https://api.telnyx.com/v2/messaging_profiles', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: profileName,
        webhook_url: webhookUrl,
        webhook_failover_url: `${webhookUrl}/failover`,
        whitelisted_destinations: whitelistedDestinations || INTERNATIONAL_DESTINATIONS,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err?.errors?.[0]?.detail || `HTTP ${res.status}`;
      console.error('[telnyx-messaging] Failed to create profile:', detail);
      return { error: detail };
    }

    const data = await res.json();
    const profile = data.data;
    
    console.log(`[telnyx-messaging] Created messaging profile: ${profile.id} (${profile.name})`);
    
    return {
      id: profile.id,
      name: profile.name,
      webhookUrl: profile.webhook_url,
      whitelistedDestinations: profile.whitelisted_destinations,
    };
  } catch (err) {
    console.error('[telnyx-messaging] Error creating messaging profile:', err);
    return { error: err.message };
  }
}

/**
 * List existing messaging profiles for an account.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @returns {Promise<Array<{id: string, name: string, phone_numbers: string[]}>>}
 */
export async function listMessagingProfiles({ apiKey }) {
  try {
    const res = await fetch('https://api.telnyx.com/v2/messaging_profiles?page[size]=100', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.error('[telnyx-messaging] Failed to list profiles:', `HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    return (data.data || []).map(profile => ({
      id: profile.id,
      name: profile.name,
      phoneNumbers: profile.phone_numbers || [],
      webhookUrl: profile.webhook_url,
      whitelistedDestinations: profile.whitelisted_destinations,
    }));
  } catch (err) {
    console.error('[telnyx-messaging] Error listing messaging profiles:', err);
    return [];
  }
}

/**
 * Assign one or more phone numbers to a messaging profile.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.profileId - Messaging profile ID
 * @param {string[]} params.phoneNumbers - E.164 phone numbers to assign
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function assignNumbersToProfile({ apiKey, profileId, phoneNumbers }) {
  try {
    const res = await fetch('https://api.telnyx.com/v2/messaging_numbers_bulk_updates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_profile_id: profileId,
        numbers: phoneNumbers,
        assign_only: true, // Only assign, don't unassign from other profiles
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err?.errors?.[0]?.detail || `HTTP ${res.status}`;
      console.error('[telnyx-messaging] Failed to assign numbers:', detail);
      return { success: false, error: detail };
    }

    console.log(`[telnyx-messaging] Assigned ${phoneNumbers.length} number(s) to profile ${profileId}`);
    return { success: true };
  } catch (err) {
    console.error('[telnyx-messaging] Error assigning numbers:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update a messaging profile's webhook URL.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.profileId - Messaging profile ID
 * @param {string|null} params.webhookUrl - New webhook URL (null = auto-use Lunao's webhook)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateMessagingProfileWebhook({ apiKey, profileId, webhookUrl }) {
  try {
    // Use Lunao's webhook URL if not provided
    const finalWebhookUrl = webhookUrl || getWebhookUrl();
    
    const res = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${profileId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_url: finalWebhookUrl,
        webhook_failover_url: `${finalWebhookUrl}/failover`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err?.errors?.[0]?.detail || `HTTP ${res.status}`;
      console.error('[telnyx-messaging] Failed to update webhook:', detail);
      return { success: false, error: detail };
    }

    console.log(`[telnyx-messaging] Updated webhook for profile ${profileId} to ${finalWebhookUrl}`);
    return { success: true };
  } catch (err) {
    console.error('[telnyx-messaging] Error updating webhook:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get details of a specific messaging profile including associated numbers.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.profileId - Messaging profile ID
 * @returns {Promise<{id: string, name: string, phoneNumbers: string[], ...} | null>}
 */
export async function getMessagingProfileDetails({ apiKey, profileId }) {
  try {
    const res = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${profileId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.error('[telnyx-messaging] Failed to get profile details:', `HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const profile = data.data;
    
    return {
      id: profile.id,
      name: profile.name,
      phoneNumbers: profile.phone_numbers || [],
      webhookUrl: profile.webhook_url,
      webhookFailoverUrl: profile.webhook_failover_url,
      whitelistedDestinations: profile.whitelisted_destinations || [],
      enabled: profile.enabled,
      createdAt: profile.created_at,
    };
  } catch (err) {
    console.error('[telnyx-messaging] Error getting profile details:', err);
    return null;
  }
}

/**
 * Get the messaging profile ID associated with a phone number.
 * Returns null if the number is not assigned to any profile.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.phoneNumber - E.164 phone number
 * @returns {Promise<string | null>} - Messaging profile ID or null
 */
export async function getNumberMessagingProfile({ apiKey, phoneNumber }) {
  try {
    // Search for the phone number with include=messaging_profile to get full details
    const searchNumber = phoneNumber.replace('+', '%2B');
    const res = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${searchNumber}&include=messaging_profile`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    if (!res.ok) {
      console.error('[telnyx-messaging] Failed to look up number:', `HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const numbers = data.data || [];
    
    if (numbers.length === 0) {
      return null;
    }

    // Check both possible field locations
    const profileId = numbers[0].messaging_profile_id || numbers[0].messaging_profile?.id || null;
    return profileId || null;
  } catch (err) {
    console.error('[telnyx-messaging] Error looking up number:', err);
    return null;
  }
}

/**
 * Check if a phone number can send SMS (has a messaging profile assigned).
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.phoneNumber - E.164 phone number
 * @returns {Promise<{canSend: boolean, profileId: string | null, profileName: string | null}>}
 */
export async function checkNumberSmsCapability({ apiKey, phoneNumber }) {
  const profileId = await getNumberMessagingProfile({ apiKey, phoneNumber });
  
  if (!profileId) {
    return {
      canSend: false,
      profileId: null,
      profileName: null,
      reason: 'not_assigned',
    };
  }

  const profile = await getMessagingProfileDetails({ apiKey, profileId });
  if (!profile) {
    return {
      canSend: false,
      profileId,
      profileName: null,
      reason: 'profile_not_found',
    };
  }

  return {
    canSend: true,
    profileId,
    profileName: profile.name,
    whitelistedDestinations: profile.whitelistedDestinations,
  };
}

/**
 * Check if a messaging profile supports sending SMS to specific countries.
 * Returns a breakdown of which countries are supported, which need setup.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.profileId - Messaging profile ID
 * @param {string[]} params.targetCountries - ISO country codes to check (e.g., ['US', 'IN', 'GB'])
 * @returns {Promise<{supported: string[], unsupported: string[], needsConfiguration: boolean}>}
 */
export async function checkProfileCountryEligibility({ apiKey, profileId, targetCountries }) {
  const profile = await getMessagingProfileDetails({ apiKey, profileId });
  
  if (!profile) {
    return {
      supported: [],
      unsupported: targetCountries || [],
      needsConfiguration: true,
      reason: 'profile_not_found',
    };
  }

  const allowed = new Set(profile.whitelistedDestinations || []);
  const targets = new Set((targetCountries || []).map(c => c.toUpperCase()));
  const supported = [...targets].filter(c => allowed.has(c));
  const unsupported = [...targets].filter(c => !allowed.has(c));

  return {
    supported,
    unsupported,
    needsConfiguration: unsupported.length > 0,
    webhookConfigured: !!profile.webhookUrl,
    webhookUrl: profile.webhookUrl,
    reason: unsupported.length > 0 ? 'missing_country_destinations' : null,
  };
}

/**
 * Check if a messaging profile has the correct webhook URL for Lunao.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.profileId - Messaging profile ID
 * @returns {Promise<{correct: boolean, currentUrl: string | null, neededUrl: string}>}
 */
export async function checkProfileWebhookStatus({ apiKey, profileId }) {
  const profile = await getMessagingProfileDetails({ apiKey, profileId });
  const neededUrl = getWebhookUrl();
  
  if (!profile) {
    return {
      correct: false,
      currentUrl: null,
      neededUrl,
      reason: 'profile_not_found',
    };
  }

  const currentUrl = profile.webhookUrl || null;
  const correct = currentUrl === neededUrl;

  return {
    correct,
    currentUrl,
    neededUrl,
    reason: !correct ? 'webhook_mismatch' : null,
  };
}

/**
 * Full setup: create a messaging profile and assign a phone number to it.
 * This is the main function to call when a user wants to enable a number.
 * 
 * @param {Object} params
 * @param {string} params.apiKey - Telnyx API key
 * @param {string} params.phoneNumber - E.164 phone number to enable
 * @param {string} params.profileName - Name for the messaging profile
 * @returns {Promise<{success: boolean, profileId?: string, error?: string}>}
 */
export async function setupNumberForSms({ apiKey, phoneNumber, profileName }) {
  // Step 1: Create messaging profile
  const profileResult = await createMessagingProfile({
    apiKey,
    profileName: profileName || `Lunao - ${phoneNumber}`,
  });

  if (profileResult.error) {
    return { success: false, error: profileResult.error };
  }

  // Step 2: Assign phone number to the profile
  const assignResult = await assignNumbersToProfile({
    apiKey,
    profileId: profileResult.id,
    phoneNumbers: [phoneNumber],
  });

  if (!assignResult.success) {
    return {
      success: false,
      profileId: profileResult.id,
      error: `Profile created but failed to assign number: ${assignResult.error}`,
    };
  }

  return {
    success: true,
    profileId: profileResult.id,
    profileName: profileResult.name,
    webhookUrl: profileResult.webhookUrl,
  };
}

// Export configuration for use elsewhere
export { INTERNATIONAL_DESTINATIONS, getWebhookUrl };

/**
 * Atomic PATCH of a messaging profile.
 *
 * Updates webhook URL, webhook failover URL, whitelisted destinations, and
 * alpha sender ID in a single API call. Returns a typed per-field result so
 * the UI can show precise pass/fail per item.
 *
 * Existing destinations are MERGED with `addCountries` (so we don't lose
 * what the user already configured). `whitelistedDestinations` (if provided)
 * REPLACES instead.
 *
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.profileId
 * @param {string} [params.webhookUrl] - if null, uses Lunao's webhook
 * @param {string[]} [params.addCountries] - ISO codes to append to current whitelist
 * @param {string[]} [params.whitelistedDestinations] - REPLACE entire whitelist
 * @param {string} [params.alphaSender] - alphanumeric sender (e.g. UAE)
 * @returns {Promise<{
 *   success: boolean,
 *   steps: Array<{step: string, ok: boolean, message: string}>,
 *   profile?: object
 * }>}
 */
export async function updateMessagingProfileAtomic({
  apiKey,
  profileId,
  webhookUrl,
  addCountries,
  whitelistedDestinations,
  alphaSender,
}) {
  const steps = [];

  // Build the patch body. Always include webhook (idempotent).
  const finalWebhookUrl = webhookUrl || getWebhookUrl();
  const body = {
    webhook_url: finalWebhookUrl,
    webhook_failover_url: `${finalWebhookUrl}/failover`,
  };

  // Resolve destination list
  if (Array.isArray(whitelistedDestinations)) {
    body.whitelisted_destinations = whitelistedDestinations;
  } else if (Array.isArray(addCountries) && addCountries.length > 0) {
    // Merge with existing
    let existing = [];
    try {
      const cur = await getMessagingProfileDetails({ apiKey, profileId });
      existing = Array.isArray(cur?.whitelistedDestinations)
        ? cur.whitelistedDestinations.filter((c) => c !== '*')
        : [];
    } catch (err) {
      // ignore — we'll just use addCountries
    }
    const merged = new Set(existing.map((c) => String(c).toUpperCase()));
    for (const c of addCountries) merged.add(String(c).toUpperCase());
    body.whitelisted_destinations = [...merged];
  }

  if (alphaSender) {
    body.alpha_sender = alphaSender;
  }

  try {
    const res = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${profileId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err?.errors?.[0]?.detail || `HTTP ${res.status}`;
      steps.push({
        step: 'patch',
        ok: false,
        message: `Profile update failed: ${detail}`,
      });
      return { success: false, steps };
    }

    const data = await res.json();
    const profile = data.data;

    steps.push({
      step: 'webhook_updated',
      ok: profile.webhook_url === finalWebhookUrl,
      message: `Webhook set to ${finalWebhookUrl}`,
    });

    if (body.whitelisted_destinations) {
      const allowed = new Set(profile.whitelisted_destinations || []);
      const allowAll = (profile.whitelisted_destinations || []).includes('*');
      const requested = whitelistedDestinations || addCountries || [];
      for (const c of requested) {
        const cc = String(c).toUpperCase();
        steps.push({
          step: `country_${cc}`,
          ok: allowAll || allowed.has(cc),
          message: allowAll || allowed.has(cc)
            ? `${cc} added to whitelist`
            : `${cc} not in whitelist after update`,
        });
      }
    }

    return { success: true, steps, profile };
  } catch (err) {
    console.error('[telnyx-messaging] Atomic update error:', err);
    steps.push({ step: 'patch', ok: false, message: err.message });
    return { success: false, steps };
  }
}
