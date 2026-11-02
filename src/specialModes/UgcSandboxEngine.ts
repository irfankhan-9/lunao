// Isolated UGC Sandbox Engine
// Strictly active ONLY when isUgcMode() === true (LNO-UGC-9X4K-77VQ).
// Ensures UGC creators can record smooth campaign launches, SMS replies, and AI
// Vibe Coding edits on desktop without triggering real Telnyx, Email, Cloudflare,
// or LLM billing. Sales Closer mode (LNO-SLS-3M8P-92ZR) bypasses this file completely
// so real APIs stay live on Zoom calls.

import {
  PipelineLead,
  PipelineEvent,
  PipelineSummary,
  PipelineResultRow,
  EmailCampaignEvent,
  SmsPlaceLead,
  ConnectedEmailAccountInfo,
  EmailAccountProbeResult,
  DorkNextRequest,
  DorkNextResponse,
  DiscoveredLead,
  PhoneAuditResponse,
  PhoneLookupItem,
} from '../lib/pipelineClient';
import {
  getContractorSiteUrl,
  SENDER_PHONE_NUMBER,
  appendSpecialCustomSmsRow,
} from './modeManager';
import { EDMONTON_230_CONTRACTORS } from './edmonton230Data';
import type { OwnerSmsRow } from '../lib/useOwnerSmsPolling';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toCleanSlug(name: string, _city?: string): string {
  const cleanName = String(name || '').trim().toLowerCase();
  const matched = EDMONTON_230_CONTRACTORS.find(
    (c) => c.name.toLowerCase() === cleanName || c.slug.includes(cleanName.replace(/[^a-z0-9]+/g, '-'))
  );
  if (matched) return matched.slug;
  const fallbackIdx = Math.abs(
    cleanName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  ) % EDMONTON_230_CONTRACTORS.length;
  return EDMONTON_230_CONTRACTORS[fallbackIdx]?.slug || 'gur-khalsa-renovation-edmonton';
}

export async function runUgcSimulatedSmsCampaign(
  params: {
    businesses?: PipelineLead[];
    csv?: string;
    niche?: string;
    templateKey?: string;
    smsTemplate?: string;
    name?: string;
  },
  onEvent: (e: PipelineEvent) => void
): Promise<{
  summary: PipelineSummary | null;
  results: PipelineResultRow[];
  campaignId: string | null;
}> {
  const leads: PipelineLead[] =
    Array.isArray(params.businesses) && params.businesses.length > 0
      ? params.businesses
      : [
          { name: 'Gur Khalsa Renovation', phone: '+17803409802', city: 'Edmonton, AB' },
          { name: 'Promark Renovations Ltd', phone: '+17787232676', city: 'Edmonton, AB' },
          { name: 'Drytech Home Renovations Edmonton', phone: '+15877130354', city: 'Edmonton, AB' },
          { name: 'Cambria Contracting', phone: '+17802781084', city: 'Edmonton, AB' },
        ];

  const campaignId = `camp_ugc_${Date.now()}`;
  onEvent({ type: 'campaign', campaignId, total: leads.length });
  onEvent({ type: 'start', total: leads.length, campaignId });

  const results: PipelineResultRow[] = [];
  let smsSent = 0;
  let failed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const slug = toCleanSlug(lead.name, String(lead.city || 'Edmonton'));
    const siteUrl = getContractorSiteUrl(slug);
    const phone = String(lead.phone || '+17805550199');

    onEvent({
      type: 'lead:start',
      index: i,
      name: lead.name,
      city: lead.city || 'Edmonton, AB',
      phone,
    });
    await sleep(160);

    onEvent({
      type: 'site:compiled',
      index: i,
      name: lead.name,
      slug,
      url: siteUrl,
      siteUrl,
    });
    await sleep(140);

    onEvent({
      type: 'site:deployed',
      index: i,
      name: lead.name,
      slug,
      url: siteUrl,
      siteUrl,
      status: 'live',
    });
    await sleep(150);

    const smsText = (
      params.smsTemplate ||
      `Yoo pal, Josh recomended u. But saw u had no site, so I build u one. pls update me tysm.\n\n{{site_url}}`
    )
      .replace(/\{\{\s*site_url\s*\}\}/gi, siteUrl)
      .replace(/\{\{\s*business_name\s*\}\}/gi, lead.name)
      .replace(/\{\{\s*city\s*\}\}/gi, String(lead.city || 'Edmonton, AB'));

    const isFailed = i >= 195 || (leads.length > 20 && i % 7 === 6);
    if (isFailed) {
      failed++;
      onEvent({
        type: 'sms:failed',
        index: i,
        name: lead.name,
        phone,
        siteUrl,
        error: 'Carrier rejected: Landline or non-SMS destination number (Error 40008)',
      });
    } else {
      smsSent++;
      onEvent({
        type: 'sms:sent',
        index: i,
        name: lead.name,
        phone,
        siteUrl,
        status: 'delivered',
        telnyxId: `msg_ugc_${Date.now()}_${i}`,
        smsText,
      });
    }

    results.push({
      index: i,
      name: lead.name,
      phone,
      city: String(lead.city || 'Edmonton, AB'),
      slug,
      siteUrl,
      siteStatus: 'live',
      smsStatus: isFailed ? 'failed' : 'delivered',
      smsSimulated: false,
      smsText,
    });
  }

  const summary: PipelineSummary = {
    total: leads.length,
    sitesGenerated: leads.length,
    smsSent,
    failed,
    telnyx: 'live',
    cloudflare: 'live',
  };

  onEvent({ type: 'done', summary, results, campaignId });
  return { summary, results, campaignId };
}

export async function runUgcSimulatedSiteDeployCampaign(
  params: {
    businesses?: PipelineLead[];
    niche?: string;
    templateKey?: string;
    name?: string;
  },
  onEvent: (e: PipelineEvent) => void
): Promise<{
  summary: PipelineSummary | null;
  results: PipelineResultRow[];
  campaignId: string | null;
}> {
  const leads: PipelineLead[] =
    Array.isArray(params.businesses) && params.businesses.length > 0
      ? params.businesses
      : [
          { name: 'Gur Khalsa Renovation', city: 'Edmonton, AB' },
          { name: 'Promark Renovations Ltd', city: 'Edmonton, AB' },
          { name: 'Drytech Home Renovations Edmonton', city: 'Edmonton, AB' },
        ];

  const campaignId = `sd_ugc_${Date.now()}`;
  onEvent({ type: 'campaign', campaignId, total: leads.length });
  onEvent({ type: 'start', total: leads.length, campaignId });

  const results: PipelineResultRow[] = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const slug = toCleanSlug(lead.name, String(lead.city || 'Edmonton'));
    const siteUrl = getContractorSiteUrl(slug);

    onEvent({ type: 'lead:start', index: i, name: lead.name, city: lead.city || 'Edmonton, AB' });
    await sleep(160);
    onEvent({ type: 'site:compiled', index: i, name: lead.name, slug, url: siteUrl, siteUrl });
    await sleep(150);
    onEvent({ type: 'site:deployed', index: i, name: lead.name, slug, url: siteUrl, siteUrl, status: 'live' });

    results.push({
      index: i,
      name: lead.name,
      city: String(lead.city || 'Edmonton, AB'),
      slug,
      siteUrl,
      siteStatus: 'live',
    });
  }

  const summary: PipelineSummary = {
    total: leads.length,
    sitesGenerated: leads.length,
    smsSent: 0,
    failed: 0,
    telnyx: 'live',
    cloudflare: 'live',
  };

  onEvent({ type: 'done', summary, results, campaignId });
  return { summary, results, campaignId };
}

export async function runUgcSimulatedEmailCampaign(
  campaignId: string,
  _accountIds: string[],
  onEvent: (event: EmailCampaignEvent) => void
): Promise<{ campaignId: string; sent: number; failed: number }> {
  const sampleLeads = [
    { name: 'Gur Khalsa Renovation', email: 'info@gurkhalsarenovations.ca', city: 'Edmonton, AB', slug: 'gur-khalsa-renovation-edmonton' },
    { name: 'Promark Renovations Ltd', email: 'contact@promarkrenovations.ca', city: 'Edmonton, AB', slug: 'promark-renovations-ltd-edmonton' },
    { name: 'Drytech Home Renovations Edmonton', email: 'office@drytechhomerenovations.ca', city: 'Edmonton, AB', slug: 'drytech-home-renovations-edmonton' },
    { name: 'Cambria Contracting', email: 'projects@cambriayeg.com', city: 'Edmonton, AB', slug: 'cambria-contracting-edmonton' },
  ];

  onEvent({ type: 'campaign', campaignId, total: sampleLeads.length });
  onEvent({ type: 'phase', phase: 'sites', message: 'Compiling personalized websites…' } as any);
  for (let i = 0; i < sampleLeads.length; i++) {
    const l = sampleLeads[i];
    const siteUrl = getContractorSiteUrl(l.slug);
    await sleep(220);
    onEvent({
      type: 'site:staged',
      leadId: i + 1,
      businessName: l.name,
      city: l.city,
      slug: l.slug,
      siteUrl,
      sitesGenerated: i + 1,
    } as any);
  }

  onEvent({ type: 'phase', phase: 'sending', message: 'Dispatching personalized outreach emails…' } as any);
  for (let i = 0; i < sampleLeads.length; i++) {
    const l = sampleLeads[i];
    const siteUrl = getContractorSiteUrl(l.slug);
    await sleep(240);
    onEvent({
      type: 'send:sent',
      leadId: i + 1,
      businessName: l.name,
      email: l.email,
      accountEmail: 'josh@apexgrowthmedia.com',
      siteUrl,
      city: l.city,
      emailsSent: i + 1,
      sitesGenerated: sampleLeads.length,
    } as any);
  }

  onEvent({
    type: 'complete',
    campaignId,
    sent: sampleLeads.length,
    failed: 0,
  });

  onEvent({
    type: 'done',
    campaignId,
    leadsFound: sampleLeads.length,
    sitesGenerated: sampleLeads.length,
    emailsSent: sampleLeads.length,
    emailsFailed: 0,
  } as any);

  return {
    campaignId,
    sent: sampleLeads.length,
    failed: 0,
  };
}

export async function runUgcSimulatedAiEdit(
  params: { html: string; instruction: string },
  onChunk: (fullHtmlSoFar: string, delta: string) => void,
  onThinking?: (text: string) => void,
  onStart?: () => void
): Promise<string> {
  if (onStart) onStart();
  if (onThinking) {
    onThinking('Analyzing layout hierarchy and typography tokens… ');
    await sleep(280);
    onThinking('Applying bespoke styling and conversion adjustments…');
    await sleep(320);
  }

  let updatedHtml = params.html || '';
  const instr = (params.instruction || '').trim();

  // Apply a non-destructive visual refinement comment & subtle style enhancement
  const enhancementStyle = `\n<!-- Refined via Vibe Studio: ${instr.replace(/-->/g, '')} -->\n`;
  if (updatedHtml.includes('</head>')) {
    updatedHtml = updatedHtml.replace('</head>', `${enhancementStyle}</head>`);
  } else {
    updatedHtml += enhancementStyle;
  }

  onChunk(updatedHtml, enhancementStyle);
  await sleep(180);
  return updatedHtml;
}

export async function sendUgcSimulatedOneOffSms(
  to: string,
  text: string,
  ownerKey = 'dashboard'
): Promise<OwnerSmsRow> {
  await sleep(350);
  const now = Date.now();
  const row: OwnerSmsRow = {
    id: Math.floor(Date.now() % 100000000),
    campaignId: 'camp-edmonton-230-hvac-sms',
    leadId: null,
    ownerKey,
    toNumber: to,
    fromNumber: SENDER_PHONE_NUMBER,
    body: text,
    status: 'delivered',
    direction: 'outbound',
    isReply: false,
    telnyxId: `msg_tlx_live_${now}`,
    errorCode: null,
    errorMessage: null,
    segmentCount: text.length > 160 ? 2 : 1,
    costCredits: 3,
    refunded: false,
    createdAt: now,
    updatedAt: now,
  };
  appendSpecialCustomSmsRow(row);
  return row;
}

// =============================================================================
// UGC Mode Austin TX Lead Generator (Zero Website Detected)
// =============================================================================
const AUSTIN_STREET_ADDRESSES = [
  '1414 S Congress Ave',
  '608 E 6th St',
  '3210 S Lamar Blvd',
  '11410 Century Oaks Terrace',
  '4800 Burnet Rd',
  '2105 E Cesar Chavez St',
  '1600 Barton Springs Rd',
  '1100 S 1st St',
  '2901 S Capital of Texas Hwy',
  '4200 N Lamar Blvd',
  '1900 E 7th St',
  '1000 E 11th St',
  '3801 S Congress Ave',
  '2200 S IH 35 Frontage Rd',
  '1209 W 6th St',
  '4301 Menchaca Rd',
  '7010 West Gate Blvd',
  '2400 E Oltorf St',
  '500 E 4th St',
  '11701 Domain Dr',
  '2201 S Lakeline Blvd',
  '5103 Airport Blvd',
  '9012 Research Blvd',
  '3400 E 4th St',
  '1801 E 51st St',
];

const AUSTIN_NAMES_BY_NICHE: Record<string, string[]> = {
  Barber: [
    'South Congress Barbershop',
    'Austin Fade Lounge',
    'Barton Springs Barber Co',
    'East 6th Grooming Parlor',
    'Red River Shave Parlor',
    'Domain Cuts & Shaves',
    'Zilker Blade Studio',
    'Lamar Blvd Barbers',
    'Travis Heights Fade Co',
    'Capital City Barber Lounge',
    'Guadalupe St Shave & Cut',
    'SoCo Classic Cuts',
    'Rainey St Barbers',
    'Mueller Fade Studio',
    'Oak Hill Barber Co',
    'Riverside Clipper Co',
    'Burnet Barber Lounge',
    'Hyde Park Classic Cuts',
    'Anderson Lane Fades',
    'Hill Country Barber Co',
    'Bouldin Creek Barbershop',
    'East Austin Clipper Lounge',
    'Manor Road Fades',
    'Clarksville Barber Studio',
    'Zilker Park Barbering',
  ],
  HVAC: [
    'Lone Star Climate Systems',
    'Austin Premier Cooling & Heating',
    'Barton Springs Air & Heat',
    'Apex HVAC Austin',
    'Hill Country Climate Care',
    'Travis County Heating & Air',
    'South Congress Air Masters',
    'Capital City Cooling Pros',
    'Zilker Air Conditioning',
    'Austin Comfort Mechanical',
    'Domain Climate Solutions',
    'Centex Heating & Air',
    'Eastside HVAC Services',
    'Guadalupe Air & Heat',
    'Red River Cooling Systems',
    'Oak Hill Heating & Air',
    'Hyde Park Climate Pro',
    'Mueller Air Pros',
    'Anderson Lane HVAC',
    'Riverside Air & Heating',
    'Congress Climate Masters',
    'Texas Sun HVAC Pros',
    'Austin EcoCooling Solutions',
    'Bouldin Creek Air & Heat',
    'Barton Hills HVAC Services',
  ],
  Dentist: [
    'Austin Smile Design',
    'South Congress Dental Lounge',
    'Barton Hills Smiles',
    'Travis Dental Studio',
    'Capital City Modern Dental',
    'East Austin Family Dentistry',
    'Domain Dental Care',
    'Zilker Smile Center',
    'Hill Country Dental Arts',
    'Hyde Park Dental Clinic',
    'Red River Dental Co',
    'Mueller Smiles Studio',
    'Burnet Rd Family Dental',
    'SoCo Smile Boutique',
    'Anderson Lane Dental Arts',
    'Oak Hill Dental Group',
    'Riverside Smiles Clinic',
    'Downtown Austin Dental',
    'Lady Bird Lake Dental',
    'Congress Family Dentistry',
  ],
  Salon: [
    'SoCo Beauty & Blowout Bar',
    'Austin Luxe Hair Lounge',
    'Eastside Hair Collective',
    'Barton Springs Salon Studio',
    'Domain Glamour Lounge',
    'Zilker Hair Artistry',
    'Capital Chic Salon',
    'Hyde Park Hair Atelier',
    'Travis Heights Beauty Studio',
    'South Lamar Hair Bar',
    'Red River Color Studio',
    'Mueller Luxe Salon',
    'Burnet Rd Hair Co',
    'Rainey St Salon Suite',
    'Hill Country Hair Studio',
    'Oak Hill Glam Bar',
    'Riverside Hair Lounge',
    'Downtown Austin Hair Studio',
    'Congress Beauty Lounge',
    'Bouldin Creek Hair Co',
  ],
  Gym: [
    'Austin Iron & Performance Club',
    'SoCo Strength & Conditioning',
    'Eastside Fitness Collective',
    'Barton Springs Cross Training',
    'Zilker Athletic Club',
    'Capital City Barbell Club',
    'Domain Fitness Studio',
    'Travis County Strength',
    'Hill Country Training Grounds',
    'Hyde Park Power & Fitness',
    'Mueller Strength Club',
    'South Lamar Boxing & Fitness',
    'Red River Iron Works',
    'Oak Hill Fitness Center',
    'Riverside Athletic Club',
    'Downtown Austin Gym',
    'Burnet Rd Barbell',
    'Lady Bird Fitness Studio',
    'Congress Strength Lab',
    'Apex Austin Gym',
  ],
  Roofing: [
    'Austin Apex Roofing Solutions',
    'Hill Country Roofing & Repair',
    'Lone Star Shingle Pros',
    'Travis County Roofing Co',
    'South Congress Roof Masters',
    'Capital City Roof Works',
    'Barton Creek Roofing',
    'Zilker Shingle & Metal',
    'Domain Roofing Contractors',
    'Red River Roof Restorations',
    'Eastside Roofing Solutions',
    'Hyde Park Roofing Pros',
    'Mueller Roof & Gutter',
    'South Lamar Roofing Co',
    'Oak Hill Shingle Works',
    'Burnet Rd Roofing',
    'Riverside Roof Specialists',
    'Downtown Austin Roofing',
    'Congress Roof Masters',
    'Centex Residential Roofing',
  ],
  'Real Estate': [
    'Austin Vanguard Realty',
    'SoCo Modern Properties',
    'Hill Country Estates Group',
    'Barton Creek Realty',
    'Capital City Luxury Homes',
    'Travis County Real Estate',
    'Domain Urban Properties',
    'Zilker Fine Estates',
    'Eastside Realty Group',
    'Hyde Park Property Collective',
    'South Lamar Realty Group',
    'Mueller Living Real Estate',
    'Red River Properties',
    'Oak Hill Real Estate Co',
    'Riverside Urban Homes',
    'Downtown Austin Living',
    'Burnet Rd Realty',
    'Congress Avenue Real Estate',
    'Lady Bird Lake Realty',
    'Centex Premier Estates',
  ],
};

const AUSTIN_PHONE_PREFIXES = ['348', '472', '891', '538', '609', '714', '822', '905', '419', '552'];

export function getAustinTxUgcLeads(
  niche: string,
  count = 20,
  customCityInput?: string,
  customProvince?: string,
  customCountry?: string
): SmsPlaceLead[] {
  const normNiche = Object.keys(AUSTIN_NAMES_BY_NICHE).find(
    (k) => k.toLowerCase() === (niche || '').toLowerCase()
  ) || 'Barber';

  // Parse city / province if user typed e.g. "Miami, FL" or "Toronto, ON"
  const rawCityStr = String(customCityInput || '').trim();
  let parsedCity = 'Austin';
  let parsedProv = customProvince || 'TX';
  let parsedCountry = customCountry || 'US';

  if (rawCityStr) {
    const parts = rawCityStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts[0]) parsedCity = parts[0];
    if (parts[1] && !customProvince) parsedProv = parts[1].toUpperCase().slice(0, 3);
    if (['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE'].includes(parsedProv)) {
      parsedCountry = 'CA';
    }
  }

  const namesPool = AUSTIN_NAMES_BY_NICHE[normNiche] || AUSTIN_NAMES_BY_NICHE['Barber'];
  const leads: SmsPlaceLead[] = [];
  const limit = Math.min(Math.max(1, count), 50);

  for (let i = 0; i < limit; i++) {
    const templateName = namesPool[i % namesPool.length] || `${parsedCity} ${niche} Specialist ${i + 1}`;
    const localizedBase =
      parsedCity.toLowerCase() === 'austin'
        ? templateName
        : templateName.replace(/\bAustin\b/gi, parsedCity);
    const name = i >= namesPool.length ? `${localizedBase} #${i + 1}` : localizedBase;
    const address = `${AUSTIN_STREET_ADDRESSES[i % AUSTIN_STREET_ADDRESSES.length]}, ${parsedCity}, ${parsedProv}`;
    const mid = AUSTIN_PHONE_PREFIXES[i % AUSTIN_PHONE_PREFIXES.length];
    const tail = String(1000 + ((i * 137 + 73) % 8999)).padStart(4, '0');
    const areaCode = parsedCountry === 'CA' ? '604' : '512';
    const phone = `+1 (${areaCode}) ${mid}-${tail}`;

    leads.push({
      placeId: `ugc_place_${parsedCity.toLowerCase().replace(/[^a-z0-9]/g, '')}_${i}_${Date.now()}`,
      name,
      address,
      city: parsedCity,
      province: parsedProv,
      country: parsedCountry,
      phone,
      website: '', // Strictly empty: no active website detected
    });
  }

  return leads;
}

// =============================================================================
// UGC Creator & Sales Guy Pre-Connected Email Accounts
// =============================================================================
export function getUgcOrSalesMockEmailAccounts(): ConnectedEmailAccountInfo[] {
  const nowSec = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'ugc_acc_josh40zx',
      provider: 'gmail',
      email: 'josh40zx@gmail.com',
      displayName: 'Josh — Primary Outreach',
      dailyCap: 200,
      connectedAt: nowSec - 18 * 86400,
      status: 'healthy',
      warmupStage: 'steady',
      sendsToday: 14,
      sendsThisWeek: 92,
      remainingToday: 186,
      bounceRate7d: 0.4,
      lastSuccessfulSend: nowSec - 900,
      tokenStatus: 'active',
      paused: 0,
      batteryCapacity: 300,
      batteryPercent: 95,
      batteryLabel: 'good',
      healthPercent: 99,
      healthLabel: 'healthy',
      health: {
        status: 'healthy',
        warmupStage: 'steady',
        daysConnected: 18,
        sendsToday: 14,
        dailyCap: 200,
        remainingToday: 186,
        batteryCapacity: 300,
        batteryPercent: 95,
        batteryLabel: 'good',
        paused: 0,
        bounceRate7d: 0.4,
        lastSuccessfulSend: nowSec - 900,
        recommendation: 'Healthy sender reputation — ready for full campaign volume.',
      },
    },
    {
      id: 'ugc_acc_webdesign3x3',
      provider: 'gmail',
      email: 'webdesginagency3x3@gmail.com',
      displayName: 'Web Design Agency 3x3',
      dailyCap: 200,
      connectedAt: nowSec - 24 * 86400,
      status: 'healthy',
      warmupStage: 'steady',
      sendsToday: 8,
      sendsThisWeek: 76,
      remainingToday: 192,
      bounceRate7d: 0.2,
      lastSuccessfulSend: nowSec - 1400,
      tokenStatus: 'active',
      paused: 0,
      batteryCapacity: 300,
      batteryPercent: 97,
      batteryLabel: 'good',
      healthPercent: 99,
      healthLabel: 'healthy',
      health: {
        status: 'healthy',
        warmupStage: 'steady',
        daysConnected: 24,
        sendsToday: 8,
        dailyCap: 200,
        remainingToday: 192,
        batteryCapacity: 300,
        batteryPercent: 97,
        batteryLabel: 'good',
        paused: 0,
        bounceRate7d: 0.2,
        lastSuccessfulSend: nowSec - 1400,
        recommendation: 'Healthy sender reputation — ready for full campaign volume.',
      },
    },
  ];
}

export function getUgcOrSalesEmailProbeResults(): EmailAccountProbeResult[] {
  return [
    {
      id: 'ugc_acc_josh40zx',
      email: 'josh40zx@gmail.com',
      provider: 'gmail',
      status: 'active',
      ok: true,
    },
    {
      id: 'ugc_acc_webdesign3x3',
      email: 'webdesginagency3x3@gmail.com',
      provider: 'gmail',
      status: 'active',
      ok: true,
    },
  ];
}

// =============================================================================
// UGC Creator & Sales Guy — Mocked Email Lead Finder (Step 2 Dork Discovery)
// =============================================================================
const EMAIL_CONTACT_PREFIXES = ['info', 'contact', 'bookings', 'hello', 'office', 'appointments', 'owner', 'frontdesk', 'inquiries', 'studio'];

export async function generateUgcOrSalesDorkLeads(
  payload: DorkNextRequest
): Promise<DorkNextResponse> {
  // Realistic multi-stage crawl delay so loading animation looks authentic on camera
  await sleep(1950);

  const cityName = payload.lockedCity?.name || 'Austin';
  const stateCode = payload.lockedCity?.admin || 'TX';
  const countryCode = payload.lockedCity?.country || 'US';
  const niche = payload.niche || 'Barber';
  const requestedCount = Math.min(Math.max(1, Number(payload.targetVolume) || 10), 50);

  const seenSet = new Set((payload.seenEmails || []).map((e) => e.toLowerCase()));
  const normNiche = Object.keys(AUSTIN_NAMES_BY_NICHE).find(
    (k) => k.toLowerCase() === niche.toLowerCase()
  ) || 'Barber';
  const namesPool = AUSTIN_NAMES_BY_NICHE[normNiche] || AUSTIN_NAMES_BY_NICHE['Barber'];

  const leads: DiscoveredLead[] = [];
  let offset = seenSet.size;

  for (let i = 0; i < requestedCount; i++) {
    const idx = offset + i;
    const rawTemplateName = namesPool[idx % namesPool.length] || `${cityName} ${niche} Group ${idx + 1}`;
    const localizedName =
      cityName.toLowerCase() === 'austin'
        ? rawTemplateName
        : rawTemplateName.replace(/\bAustin\b/gi, cityName);
    const businessName = idx >= namesPool.length ? `${localizedName} #${idx + 1}` : localizedName;

    const domainSlug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 22) || `local${niche.toLowerCase()}${idx + 1}`;
    const emailPrefix = EMAIL_CONTACT_PREFIXES[idx % EMAIL_CONTACT_PREFIXES.length];
    const emailHost = `${domainSlug}.com`;
    let email = `${emailPrefix}@${emailHost}`;
    if (seenSet.has(email.toLowerCase())) {
      email = `${emailPrefix}${idx + 1}@${emailHost}`;
    }
    seenSet.add(email.toLowerCase());

    const mid = AUSTIN_PHONE_PREFIXES[idx % AUSTIN_PHONE_PREFIXES.length];
    const tail = String(1000 + ((idx * 137 + 73) % 8999)).padStart(4, '0');
    const areaCode = countryCode === 'CA' ? '604' : '512';
    const phone = `(${areaCode}) ${mid}-${tail}`;

    const slug = toCleanSlug(businessName, cityName);

    leads.push({
      business_name: businessName,
      email,
      email_host: emailHost,
      phone,
      website: `https://www.${emailHost}`,
      discovery_method: idx % 3 === 0 ? 'contact_page_crawler' : 'homepage_mailto_extract',
      mx_verified: true,
      city: cityName,
      state: stateCode,
      source_query: `${niche} in ${cityName}, ${stateCode}`,
      source_page: 1 + Math.floor(i / 10),
      source_rank: i + 1,
      slug,
    });
  }

  return {
    ok: true,
    done: true,
    completionStatus: 'target_reached',
    completionMessage: `Found ${leads.length} verified ${niche} business emails in ${cityName}, ${stateCode}.`,
    creditsCharged: 0,
    creditsRefunded: 0,
    newBalance: null,
    nextCity: {
      name: cityName,
      country: countryCode,
      state: stateCode,
      page: 1,
      budget: requestedCount,
      isNearby: false,
    },
    leads,
    telemetry: {
      timestamp: new Date().toLocaleTimeString(),
      providerUsed: 'google_places_crawler',
      query: `${niche} in ${cityName}, ${stateCode}`,
      totalSearchesMade: Math.max(1, Math.ceil(requestedCount / 8)),
      placesReturnedPerSearch: requestedCount + 4,
      totalDuplicatesFiltered: 2,
      placesQueriesRun: Math.max(1, Math.ceil(requestedCount / 8)),
      totalPlacesFound: requestedCount + 4,
      websitesCrawled: requestedCount + 2,
      mxVerifiedCount: leads.length,
      stoppedDueToSaturation: false,
      crawledWithEmail: leads.map((l) => ({
        business_name: l.business_name,
        email: l.email,
        website: l.website,
        method: l.discovery_method || 'contact_page',
      })),
      crawledWithoutEmail: [
        {
          business_name: `${cityName} Classic ${niche} Studio`,
          website: `https://www.${cityName.toLowerCase().replace(/[^a-z0-9]/g, '')}${niche.toLowerCase()}studio.com`,
          reason: 'Contact form only — no direct mailto address listed',
        },
      ],
      mapsWithoutWebsite: [
        {
          business_name: `Downtown ${cityName} ${niche} Co`,
          maps_url: `https://www.google.com/maps/search/${encodeURIComponent(`Downtown ${cityName} ${niche}`)}`,
          reason: 'Google Maps profile has no website URL attached',
        },
      ],
      searches: [
        {
          batchNumber: 1,
          query: `${niche.toLowerCase()} in ${cityName} ${stateCode}`,
          page: 1,
          placesReturned: requestedCount + 4,
          duplicatesFiltered: 2,
          duplicateRate: 10,
          stoppedDueToSaturation: false,
          newUniqueWebsites: requestedCount + 1,
          emailsFound: leads.length,
        },
      ],
    },
  };
}

// =============================================================================
// UGC Creator & Sales Guy — Mocked Phone Line-Type Audit (Step 2 Verify Leads)
// =============================================================================
export async function simulateUgcOrSalesPhoneAudit(
  numbers: string[]
): Promise<PhoneAuditResponse> {
  await sleep(1250);

  const cleanNums = numbers.map((n) => String(n || '').trim()).filter(Boolean);
  const results: PhoneLookupItem[] = cleanNums.map((raw, idx) => {
    const digits = raw.replace(/\D/g, '');
    const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith('1') && digits.length === 11 ? `+${digits}` : raw;

    // Deterministically mark ~25% of leads (at least 1 when >= 2 leads) as Landline / Landlord office lines
    // so the user can see the red Landline badge and click "Remove Landlines & Non-SMS"
    const isLandline =
      cleanNums.length >= 2
        ? idx === 1 || (idx > 1 && idx % 4 === 3)
        : false;

    if (isLandline) {
      return {
        phone: raw,
        e164,
        valid: true,
        rawType: 'fixed line',
        lineType: 'landline' as const,
        isSmsCapable: false,
        carrierName: 'AT&T Commercial Landline / Property Desk',
        countryCode: 'US',
        cached: false,
        telnyxVerified: true,
        schemaVersion: 4,
      };
    }

    const mobileCarriers = [
      'Verizon Wireless',
      'T-Mobile USA',
      'AT&T Mobility PCS',
      'Rogers Wireless',
      'Telus Mobility',
    ];

    return {
      phone: raw,
      e164,
      valid: true,
      rawType: 'mobile',
      lineType: 'mobile' as const,
      isSmsCapable: true,
      carrierName: mobileCarriers[idx % mobileCarriers.length],
      countryCode: 'US',
      cached: false,
      telnyxVerified: true,
      schemaVersion: 4,
    };
  });

  const mobileCount = results.filter((r) => r.lineType === 'mobile' && r.isSmsCapable).length;
  const landlineCount = results.filter((r) => r.lineType === 'landline').length;

  return {
    ok: true,
    results,
    summary: {
      total: results.length,
      mobileCount,
      landlineCount,
      voipCount: 0,
      invalidCount: 0,
      cachedCount: 0,
      newLookups: results.length,
    },
  };
}


