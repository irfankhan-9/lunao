// Carrier Route & Lead Phone Compatibility Validator for Telnyx
// Inspects lead phone numbers against the connected Telnyx carrier sender line
// Provides exact telecom-grounded reasons why a destination number can or cannot receive SMS

import { PipelineLead } from './pipelineClient';

export interface LeadCompatibilityResult {
  lead: PipelineLead;
  index: number;
  isCompatible: boolean;
  severity: 'valid' | 'warning' | 'incompatible';
  rawPhone: string;
  normalizedPhone: string;
  destinationCountry: string;
  destinationCode: string;
  issueCategory: 'country_mismatch' | 'invalid_length' | 'toll_free' | 'invalid_area_code' | 'empty' | 'valid';
  realReason: string;
  recommendedAction: string;
}

export interface RouteInspectionSummary {
  totalLeads: number;
  compatibleCount: number;
  incompatibleCount: number;
  warningCount: number;
  senderCountry: string;
  senderPhone: string;
  results: LeadCompatibilityResult[];
  hasCountryMismatch: boolean;
  hasInvalidFormat: boolean;
  hasTollFree: boolean;
}

// Known international calling codes map
const COUNTRY_CODES: Array<{ prefix: string; name: string; minLen: number; maxLen: number }> = [
  { prefix: '1', name: 'US / Canada (NANP)', minLen: 10, maxLen: 11 },
  { prefix: '44', name: 'United Kingdom', minLen: 10, maxLen: 11 },
  { prefix: '61', name: 'Australia', minLen: 9, maxLen: 10 },
  { prefix: '33', name: 'France', minLen: 9, maxLen: 10 },
  { prefix: '49', name: 'Germany', minLen: 10, maxLen: 12 },
  { prefix: '34', name: 'Spain', minLen: 9, maxLen: 9 },
  { prefix: '39', name: 'Italy', minLen: 9, maxLen: 11 },
  { prefix: '52', name: 'Mexico', minLen: 10, maxLen: 10 },
  { prefix: '91', name: 'India', minLen: 10, maxLen: 10 },
  { prefix: '81', name: 'Japan', minLen: 10, maxLen: 10 },
  { prefix: '64', name: 'New Zealand', minLen: 8, maxLen: 10 },
  { prefix: '353', name: 'Ireland', minLen: 9, maxLen: 9 },
];

const NANP_TOLL_FREE = ['800', '888', '877', '866', '855', '844', '833'];
const NANP_SPECIAL_SERVICES = ['911', '411', '311', '211', '511', '611', '711', '811'];

/**
 * Extracts digits from a phone string while tracking if a leading plus was supplied
 */
export function extractDigits(phone: string): { digits: string; hasPlus: boolean } {
  const clean = String(phone || '').trim();
  const hasPlus = clean.startsWith('+');
  const digits = clean.replace(/\D/g, '');
  return { digits, hasPlus };
}

/**
 * Infers the country calling code and country name from digits
 */
export function detectCountry(digits: string, hasPlus: boolean): { code: string; name: string } {
  if (!digits) return { code: '', name: 'Unknown' };

  // Explicit + notation takes top priority
  if (hasPlus) {
    for (const c of COUNTRY_CODES) {
      if (digits.startsWith(c.prefix)) {
        return { code: `+${c.prefix}`, name: c.name };
      }
    }
  }

  // 10 digits standard North American
  if (digits.length === 10) {
    return { code: '+1', name: 'US / Canada (NANP)' };
  }

  // 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return { code: '+1', name: 'US / Canada (NANP)' };
  }

  // Check known international patterns if digits start with international prefixes
  for (const c of COUNTRY_CODES) {
    if (c.prefix !== '1' && digits.startsWith(c.prefix)) {
      return { code: `+${c.prefix}`, name: c.name };
    }
  }

  // Default fallback if North American digit range
  if (digits.length >= 10 && digits.length <= 11) {
    return { code: '+1', name: 'US / Canada (NANP)' };
  }

  return { code: 'Unknown', name: 'Unassigned Region' };
}

/**
 * Inspects a single lead's phone number against the sender's carrier line
 */
export function inspectLeadPhone(
  lead: PipelineLead,
  index: number,
  senderPhoneNumber?: string | null
): LeadCompatibilityResult {
  const rawPhone = String(lead.phone || (lead as any).phoneNumber || (lead as any).tel || '').trim();
  const leadName = lead.name || `Lead #${index + 1}`;

  // Default sender country is +1 (NANP) for Telnyx Canada / US 10DLC
  const senderDigits = senderPhoneNumber ? extractDigits(senderPhoneNumber) : { digits: '16049539651', hasPlus: true };
  const senderCountry = detectCountry(senderDigits.digits, senderDigits.hasPlus);
  const senderCode = senderCountry.code || '+1';

  // 1. Missing phone
  if (!rawPhone) {
    return {
      lead,
      index,
      isCompatible: false,
      severity: 'incompatible',
      rawPhone: '',
      normalizedPhone: '',
      destinationCountry: 'None',
      destinationCode: '',
      issueCategory: 'empty',
      realReason: 'No destination phone number detected in record. Telnyx carrier routing requires an active recipient phone address.',
      recommendedAction: 'Add a valid 10-digit phone number or remove this row from the campaign.',
    };
  }

  const { digits, hasPlus } = extractDigits(rawPhone);

  // 2. Incomplete length (< 10 digits)
  if (digits.length < 10) {
    return {
      lead,
      index,
      isCompatible: false,
      severity: 'incompatible',
      rawPhone,
      normalizedPhone: digits,
      destinationCountry: 'Invalid Length',
      destinationCode: '',
      issueCategory: 'invalid_length',
      realReason: `Incomplete telephone number (${digits.length} digits). Missing area code. Telnyx carrier routing requires full 10-digit national format (E.164 standard).`,
      recommendedAction: 'Supply the complete 10-digit number including the local 3-digit area code.',
    };
  }

  // 3. Excess digits (> 15 digits)
  if (digits.length > 15) {
    return {
      lead,
      index,
      isCompatible: false,
      severity: 'incompatible',
      rawPhone,
      normalizedPhone: digits,
      destinationCountry: 'Overflow',
      destinationCode: '',
      issueCategory: 'invalid_length',
      realReason: `Number contains ${digits.length} digits, exceeding the ITU-T E.164 maximum of 15 digits for telecom routing.`,
      recommendedAction: 'Trim extraneous extensions or trailing numerical characters.',
    };
  }

  const detected = detectCountry(digits, hasPlus);

  // 4. North American Numbering Plan (+1) specific validations
  if (detected.code === '+1') {
    const nanp10 = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
    const areaCode = nanp10.slice(0, 3);
    const exchangeCode = nanp10.slice(3, 6);

    // Toll-Free prefix
    if (NANP_TOLL_FREE.includes(areaCode)) {
      return {
        lead,
        index,
        isCompatible: false,
        severity: 'incompatible',
        rawPhone,
        normalizedPhone: `+1${nanp10}`,
        destinationCountry: 'Toll-Free (US/Canada)',
        destinationCode: '+1',
        issueCategory: 'toll_free',
        realReason: `Toll-free destination prefix (1-${areaCode}). Outbound peer A2P messaging cannot deliver to toll-free consumer numbers. Carrier routes will drop or reject this transmission.`,
        recommendedAction: 'Replace with the business owner’s direct local mobile or landline number.',
      };
    }

    // Special service / Emergency prefix
    if (NANP_SPECIAL_SERVICES.includes(areaCode)) {
      return {
        lead,
        index,
        isCompatible: false,
        severity: 'incompatible',
        rawPhone,
        normalizedPhone: `+1${nanp10}`,
        destinationCountry: 'Special Service Line',
        destinationCode: '+1',
        issueCategory: 'invalid_area_code',
        realReason: `Reserved special service line (${areaCode}). Not an SMS-capable subscriber line.`,
        recommendedAction: 'Exclude this row from your campaign leads.',
      };
    }

    // Area code cannot start with 0 or 1 under NANP standards
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      return {
        lead,
        index,
        isCompatible: false,
        severity: 'incompatible',
        rawPhone,
        normalizedPhone: `+1${nanp10}`,
        destinationCountry: 'Invalid NANP',
        destinationCode: '+1',
        issueCategory: 'invalid_area_code',
        realReason: `Invalid North American area code (${areaCode}). NANP telephone standards require area codes to begin with digits 2–9. Carrier switches will reject this destination as unroutable.`,
        recommendedAction: 'Correct the area code to match the target business’s geographic region.',
      };
    }

    // Exchange code (NXX) cannot start with 0 or 1
    if (exchangeCode.startsWith('0') || exchangeCode.startsWith('1')) {
      return {
        lead,
        index,
        isCompatible: false,
        severity: 'incompatible',
        rawPhone,
        normalizedPhone: `+1${nanp10}`,
        destinationCountry: 'Invalid Exchange',
        destinationCode: '+1',
        issueCategory: 'invalid_area_code',
        realReason: `Invalid exchange prefix (${exchangeCode}). North American Central Office codes cannot begin with 0 or 1.`,
        recommendedAction: 'Verify the local business telephone number.',
      };
    }

    // Sender mismatch: if sender is international (e.g. +44) sending to US/Canada (+1)
    if (senderCode !== '+1') {
      return {
        lead,
        index,
        isCompatible: false,
        severity: 'warning',
        rawPhone,
        normalizedPhone: `+1${nanp10}`,
        destinationCountry: 'US / Canada (+1)',
        destinationCode: '+1',
        issueCategory: 'country_mismatch',
        realReason: `Cross-border destination mismatch. Your selected Telnyx sender (${senderPhoneNumber || senderCode}) is in ${senderCountry.name}, while this recipient is in North America (+1). Carrier cross-border routing applies and may incur international rates or require international permissions.`,
        recommendedAction: 'Select a North American (+1) carrier sender number or confirm international permissions.',
      };
    }

    // Fully valid North American number
    return {
      lead,
      index,
      isCompatible: true,
      severity: 'valid',
      rawPhone,
      normalizedPhone: `+1${nanp10}`,
      destinationCountry: 'US / Canada (+1)',
      destinationCode: '+1',
      issueCategory: 'valid',
      realReason: 'Standard E.164 North American number (+1). Compatible with Telnyx 10DLC carrier delivery.',
      recommendedAction: 'Ready to send.',
    };
  }

  // 5. International Number check against sender
  if (detected.code !== senderCode) {
    return {
      lead,
      index,
      isCompatible: false,
      severity: 'incompatible',
      rawPhone,
      normalizedPhone: `${detected.code}${digits.replace(new RegExp(`^${detected.code.replace('+', '')}`), '')}`,
      destinationCountry: `${detected.name} (${detected.code})`,
      destinationCode: detected.code,
      issueCategory: 'country_mismatch',
      realReason: `Cross-border destination mismatch. Destination country is ${detected.name} (${detected.code}), but your selected Telnyx sender is ${senderCountry.name} (${senderCode}). Telnyx 10DLC messaging profiles only permit delivery to North American mobile networks. International messaging requires explicitly enabling cross-border routing on your Telnyx profile.`,
      recommendedAction: `Enable international SMS destination for ${detected.name} in your Telnyx Mission Control portal or filter this recipient.`,
    };
  }

  // Fully valid international match
  return {
    lead,
    index,
    isCompatible: true,
    severity: 'valid',
    rawPhone,
    normalizedPhone: `${detected.code}${digits}`,
    destinationCountry: `${detected.name} (${detected.code})`,
    destinationCode: detected.code,
    issueCategory: 'valid',
    realReason: `Compatible carrier route for ${detected.name} (${detected.code}).`,
    recommendedAction: 'Ready to send.',
  };
}

/**
 * Inspects an entire list of campaign leads against the selected sender phone number
 */
export function inspectLeadsForTelnyx(
  leads: PipelineLead[],
  senderPhoneNumber?: string | null
): RouteInspectionSummary {
  const senderDigits = senderPhoneNumber ? extractDigits(senderPhoneNumber) : { digits: '16049539651', hasPlus: true };
  const senderCountry = detectCountry(senderDigits.digits, senderDigits.hasPlus);

  const results: LeadCompatibilityResult[] = (leads || []).map((lead, idx) =>
    inspectLeadPhone(lead, idx, senderPhoneNumber)
  );

  const compatibleCount = results.filter((r) => r.isCompatible).length;
  const incompatibleCount = results.filter((r) => !r.isCompatible).length;
  const warningCount = results.filter((r) => r.severity === 'warning').length;

  const hasCountryMismatch = results.some((r) => r.issueCategory === 'country_mismatch');
  const hasInvalidFormat = results.some((r) => r.issueCategory === 'invalid_length' || r.issueCategory === 'invalid_area_code' || r.issueCategory === 'empty');
  const hasTollFree = results.some((r) => r.issueCategory === 'toll_free');

  return {
    totalLeads: leads.length,
    compatibleCount,
    incompatibleCount,
    warningCount,
    senderCountry: senderCountry.name,
    senderPhone: senderPhoneNumber || '+1 (604) 953-9651',
    results,
    hasCountryMismatch,
    hasInvalidFormat,
    hasTollFree,
  };
}
