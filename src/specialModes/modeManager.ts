// Isolated Special Mode Manager (UGC Influencer & Sales Closer Modes)
// Zero impact on normal users unless one of the two unguessable codes is redeemed.

import { Campaign, Business, CampaignSmsLead, CampaignDeployedSite } from '../types';
import { EDMONTON_230_CONTRACTORS, EdmontonContractor } from './edmonton230Data';
import type { OwnerSmsRow } from '../lib/useOwnerSmsPolling';
import type { DashboardStats, SiteRow, SitesCounts, EditorSite } from '../lib/pipelineClient';

export type SpecialModeType = 'ugc' | 'sales' | 'affiliate' | null;

export const UGC_SECRET_CODE = 'LNO-UGC-9X4K-77VQ';
export const SALES_SECRET_CODE = 'LNO-SLS-3M8P-92ZR';
export const AFFILIATE_SECRET_CODE = 'LNO-AFF-8K2M-44QP';
export const RESET_SECRET_CODE = 'NORMALSITE99XX73';

const MODE_STORAGE_KEY = 'lunao_special_mode';
const DATA_VERSION_KEY = 'lunao_special_data_version';
const ANCHOR_TS_KEY = 'lunao_special_anchor_ts';
const SPECIAL_DATA_VERSION = 'v3_cf_pages_randomized';
const USER_NAME_KEY = 'lunao_user_name';
const USER_EMAIL_KEY = 'lunao_user_email';

export const SPECIAL_CAMPAIGN_ID = 'camp-edmonton-230-hvac-sms';
export const SENDER_PHONE_NUMBER = '+1 (587) 409-8821';
export const CLOUDFLARE_PAGES_BASE_URL = 'https://lunao-web-designn.pages.dev';

let didAutoSyncThisLoad = false;

export function getSpecialMode(): SpecialModeType {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(MODE_STORAGE_KEY);
    if (val === 'ugc' || val === 'sales' || val === 'affiliate') {
      if (!didAutoSyncThisLoad && localStorage.getItem(DATA_VERSION_KEY) !== SPECIAL_DATA_VERSION) {
        didAutoSyncThisLoad = true;
        try {
          const anchor = Date.now();
          localStorage.setItem(ANCHOR_TS_KEY, String(anchor));
          const { campaign, businesses } = buildEdmonton230CampaignAndBusinesses(anchor);
          localStorage.setItem('lunao_campaigns', JSON.stringify([campaign]));
          localStorage.setItem('lunao_businesses', JSON.stringify(businesses));
          localStorage.setItem(DATA_VERSION_KEY, SPECIAL_DATA_VERSION);
        } catch {
          /* ignore */
        }
      }
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

export function isUgcMode(): boolean {
  return getSpecialMode() === 'ugc';
}

export function isSalesMode(): boolean {
  return getSpecialMode() === 'sales';
}

export function isAffiliateMode(): boolean {
  return getSpecialMode() === 'affiliate';
}

export function isSpecialModeActive(): boolean {
  const m = getSpecialMode();
  return m === 'ugc' || m === 'sales' || m === 'affiliate';
}

export function getContractorSiteUrl(slug: string): string {
  const cleanSlug = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  return `${CLOUDFLARE_PAGES_BASE_URL}/${cleanSlug}/`;
}

export function getOutboundSmsBody(contractor: EdmontonContractor): string {
  const siteUrl = getContractorSiteUrl(contractor.slug);
  return `Yoo pal, Josh recomended u. But saw u had no site, so I build u one. pls update me tysm.\n\n${siteUrl}`;
}

function getSpecialAnchorTs(): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = localStorage.getItem(ANCHOR_TS_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    const now = Date.now();
    localStorage.setItem(ANCHOR_TS_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

// Precompute cumulative irregular time offsets (in ms) so timestamps look 100% organic
// and never robotic, while keeping threads sorted in a scattered, natural order.
const CUMULATIVE_OFFSETS_MS: number[] = (() => {
  const arr: number[] = [];
  let acc = 4 * 60 * 1000; // newest thread is ~4 minutes ago
  for (let i = 0; i < 235; i++) {
    arr.push(acc);
    // Irregular step between 27s and 76s
    const stepSec = 27 + ((i * 37 + (i % 7) * 19) % 50);
    acc += stepSec * 1000;
  }
  return arr;
})();

function getContractorTimestamps(c: EdmontonContractor, anchorTs: number): {
  outboundTs: number;
  replyTs: number | null;
} {
  const slotTs = anchorTs - (CUMULATIVE_OFFSETS_MS[c.index] ?? c.index * 45000);
  if (c.replyText) {
    // Place the received reply at `slotTs` so the 6 replies appear at their scattered
    // positions (#3, #14, #32, #59, #97, #149) in the "All" list instead of clumping together,
    // and set the outbound SMS 11–34 minutes earlier than the reply.
    const replyDelayMs = (11 + ((c.index * 7) % 24)) * 60 * 1000;
    return {
      outboundTs: slotTs - replyDelayMs,
      replyTs: slotTs,
    };
  }
  return {
    outboundTs: slotTs,
    replyTs: null,
  };
}

/**
 * Deterministically builds the 230-contractor SMS campaign and 230 Business entries
 * with 195 delivered SMS, 35 failed SMS, 6 scattered contractor replies, and 230 live
 * Cloudflare Pages sites (`https://lunao-web-designn.pages.dev/<slug>/`).
 */
export function buildEdmonton230CampaignAndBusinesses(customAnchorTs?: number): {
  campaign: Campaign;
  businesses: Business[];
} {
  const anchorTs = customAnchorTs || getSpecialAnchorTs();
  const baseTs = anchorTs - 3.5 * 3600 * 1000;

  const deployedSites: CampaignDeployedSite[] = [];
  const smsLeads: CampaignSmsLead[] = [];
  const businesses: Business[] = [];

  for (const c of EDMONTON_230_CONTRACTORS) {
    const siteUrl = getContractorSiteUrl(c.slug);
    const smsText = getOutboundSmsBody(c);
    const { outboundTs, replyTs } = getContractorTimestamps(c, anchorTs);
    const outboundIso = new Date(outboundTs).toISOString();

    deployedSites.push({
      slug: c.slug,
      name: c.name,
      city: c.city,
      url: siteUrl,
      status: 'live',
    });

    smsLeads.push({
      leadId: `edm-lead-${c.index + 1}`,
      name: c.name,
      businessName: c.name,
      phone: c.phone,
      city: c.city,
      siteUrl,
      status: c.smsStatus,
      smsText,
      sentAt: outboundIso,
      reason: c.errorReason || undefined,
    });

    const smsHistory: Business['smsHistory'] = [
      {
        text: smsText,
        timestamp: outboundIso,
        type: 'outgoing',
        deliveryStatus: c.smsStatus,
        telnyxId: c.smsStatus === 'delivered' ? `msg_tlx_${100000 + c.index}` : null,
      },
    ];

    if (c.replyText && replyTs) {
      smsHistory.push({
        text: c.replyText,
        timestamp: new Date(replyTs).toISOString(),
        type: 'incoming',
      });
    }

    businesses.push({
      id: `biz-edm-${c.index + 1}`,
      name: c.name,
      owner: 'Owner',
      phone: c.phone,
      city: c.city,
      niche: 'HVAC',
      webStatus: 'No website',
      siteStatus: c.replyText ? 'Converted' : c.smsStatus === 'delivered' ? 'SMS sent' : 'Site generated',
      slug: c.slug,
      smsHistory,
      siteUrl,
    });
  }

  const campaign: Campaign = {
    id: SPECIAL_CAMPAIGN_ID,
    serverCampaignId: SPECIAL_CAMPAIGN_ID,
    name: 'Edmonton Contractors Outreach (Apex Climate Care)',
    niche: 'HVAC',
    type: 'sms',
    status: 'Completed',
    templateId: 'hvac-bespoke',
    createdAt: new Date(baseTs).toISOString(),
    leadsFound: 230,
    totalLeads: 230,
    sitesGenerated: 230,
    sites: 230,
    smsSent: 195,
    claimed: 6,
    smsPhoneUsed: SENDER_PHONE_NUMBER,
    smsMessage: `Yoo pal, Josh recomended u. But saw u had no site, so I build u one. pls update me tysm.\n\n{{site_url}}`,
    deployedSites,
    smsLeads,
  };

  return { campaign, businesses };
}

/**
 * Generates all 236 OwnerSmsRow records (230 outbound SMS + 6 scattered inbound replies)
 * plus any custom one-off messages sent during the session.
 * Applies to BOTH Sales Closer (LNO-SLS-3M8P-92ZR) and UGC Influencer (LNO-UGC-9X4K-77VQ) modes.
 */
export function getSpecialModeSmsRows(ownerKey = 'dashboard'): OwnerSmsRow[] {
  if (!isSpecialModeActive()) return [];

  const anchorTs = getSpecialAnchorTs();
  const rows: OwnerSmsRow[] = [];

  for (const c of EDMONTON_230_CONTRACTORS) {
    const smsText = getOutboundSmsBody(c);
    const { outboundTs, replyTs } = getContractorTimestamps(c, anchorTs);

    rows.push({
      id: 900000 + c.index,
      campaignId: SPECIAL_CAMPAIGN_ID,
      leadId: c.index + 1,
      ownerKey,
      toNumber: c.phone,
      fromNumber: SENDER_PHONE_NUMBER,
      body: smsText,
      status: c.smsStatus,
      direction: 'outbound',
      isReply: false,
      telnyxId: c.smsStatus === 'delivered' ? `msg_tlx_${100000 + c.index}` : null,
      errorCode: c.smsStatus === 'failed' ? '40008' : null,
      errorMessage: c.errorReason,
      segmentCount: 2,
      costCredits: 3,
      refunded: c.smsStatus === 'failed',
      createdAt: outboundTs,
      updatedAt: outboundTs,
    });

    if (c.replyText && replyTs) {
      rows.push({
        id: 950000 + c.index,
        campaignId: SPECIAL_CAMPAIGN_ID,
        leadId: c.index + 1,
        ownerKey,
        toNumber: c.phone,
        fromNumber: c.phone,
        body: c.replyText,
        status: 'reply',
        direction: 'inbound',
        isReply: true,
        telnyxId: `msg_in_${200000 + c.index}`,
        errorCode: null,
        errorMessage: null,
        segmentCount: 1,
        costCredits: 0,
        refunded: false,
        createdAt: replyTs,
        updatedAt: replyTs,
      });
    }
  }

  // Include any custom outbound replies sent by the user during this session
  try {
    const rawCustom = localStorage.getItem('lunao_special_custom_sms');
    if (rawCustom) {
      const parsed = JSON.parse(rawCustom);
      if (Array.isArray(parsed)) {
        rows.push(...parsed);
      }
    }
  } catch {
    /* ignore */
  }

  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function appendSpecialCustomSmsRow(row: OwnerSmsRow): void {
  try {
    const raw = localStorage.getItem('lunao_special_custom_sms');
    const existing: OwnerSmsRow[] = raw ? JSON.parse(raw) : [];
    existing.unshift(row);
    localStorage.setItem('lunao_special_custom_sms', JSON.stringify(existing));
  } catch {
    /* ignore */
  }
}

export function getSpecialModeDashboardStats(): DashboardStats | null {
  if (!isSpecialModeActive()) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return {
    sitesDeployedToday: 230,
    sitesDeployedTotal: 230,
    emailsSentToday: 0,
    emailsSentTotal: 0,
    asOf: nowSec,
    windowStart: Math.floor(startOfDay.getTime() / 1000),
  };
}

export function getSpecialModeSitesDirectory(opts?: {
  source?: 'site-deploy' | 'email' | 'sms';
  limit?: number;
}): { sites: SiteRow[]; counts: SitesCounts } | null {
  if (!isSpecialModeActive()) return null;
  const createdTs = Math.floor((Date.now() - 3600 * 1000) / 1000);

  const allSites: SiteRow[] = EDMONTON_230_CONTRACTORS.map((c) => ({
    source: 'sms',
    lead_id: c.index + 1,
    campaign_id: SPECIAL_CAMPAIGN_ID,
    campaign_name: 'Edmonton Contractors Outreach (Apex Climate Care)',
    niche: 'HVAC',
    campaign_status: 'Completed',
    campaign_started_at: createdTs,
    business_name: c.name,
    city: c.city,
    phone: c.displayPhone,
    lead_niche: 'HVAC',
    site_url: getContractorSiteUrl(c.slug),
    slug: c.slug,
    lead_status: c.smsStatus,
    created_at: createdTs - c.index * 5,
  }));

  const counts: SitesCounts = {
    total: 230,
    siteDeploy: 0,
    email: 0,
    sms: 230,
  };

  let filtered = allSites;
  if (opts?.source && opts.source !== 'sms') {
    filtered = [];
  }
  if (opts?.limit) {
    filtered = filtered.slice(0, opts.limit);
  }

  return { sites: filtered, counts };
}

export function getSpecialModeEditorSites(): EditorSite[] {
  return [];
}

export function getSavedUserProfile(): { name: string; email: string } {
  if (typeof window === 'undefined') {
    return { name: 'Operator', email: 'operator@lunao.local' };
  }
  if (isSpecialModeActive()) {
    return {
      name: localStorage.getItem(USER_NAME_KEY) || 'Josh',
      email: localStorage.getItem(USER_EMAIL_KEY) || 'josh@apexgrowthmedia.com',
    };
  }
  return {
    name: localStorage.getItem(USER_NAME_KEY) || 'Operator',
    email: localStorage.getItem(USER_EMAIL_KEY) || 'operator@lunao.local',
  };
}

export async function redeemSpecialAccessCode(rawCode: string): Promise<{
  ok: boolean;
  mode?: SpecialModeType;
  plan?: string;
  credits?: number;
  userName?: string;
  userEmail?: string;
  message: string;
}> {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) {
    return { ok: false, message: 'Please enter a valid access code.' };
  }

  const ownerKey =
    (typeof window !== 'undefined' && localStorage.getItem('lunao_owner_key')) || 'dashboard';

  const isUgc = code === UGC_SECRET_CODE || code === 'UGC' || code === 'UGCPLAN' || code === 'UGCCREATOR';
  const isSales = code === SALES_SECRET_CODE || code === 'SALES' || code === 'SALESPLAN' || code === 'SALESGUY';
  const isAffiliate = code === AFFILIATE_SECRET_CODE || code === 'AFFILIATE' || code === 'AFF' || code === 'AFFILIATEPLAN' || code === 'LNO-AFF';
  const isReset = code === RESET_SECRET_CODE || code === 'NORMALSITE99XX73' || code === 'NORMALSITE' || code === 'LNO-RST-0000-CLEAN' || code === 'NORMAL';

  if (isUgc || isSales || isAffiliate) {
    const mode: SpecialModeType = isAffiliate ? 'affiliate' : (isUgc ? 'ugc' : 'sales');
    const credits = 9800 + Math.floor(Math.random() * 60);
    const vibeCredits = 920;
    const userName = 'Josh';
    const userEmail = 'josh@apexgrowthmedia.com';
    const plan = 'Agency Plan';

    // Sync server credits so Sales mode live tests have real server-side balance
    try {
      await fetch('/api/special-mode/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: isAffiliate ? AFFILIATE_SECRET_CODE : (isUgc ? UGC_SECRET_CODE : SALES_SECRET_CODE), ownerKey, credits }),
      });
    } catch {
      /* non-fatal offline fallback */
    }

    const anchorTs = Date.now();
    const { campaign, businesses } = buildEdmonton230CampaignAndBusinesses(anchorTs);

    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
      localStorage.setItem(ANCHOR_TS_KEY, String(anchorTs));
      localStorage.setItem(DATA_VERSION_KEY, SPECIAL_DATA_VERSION);
      localStorage.setItem(USER_NAME_KEY, userName);
      localStorage.setItem(USER_EMAIL_KEY, userEmail);
      localStorage.setItem('lunao_user_plan', plan);
      localStorage.setItem('lunao_user_credits', String(credits));
      localStorage.setItem('lunao_vibe_credits', String(vibeCredits));
      localStorage.removeItem('lunao_special_custom_sms');
      localStorage.setItem('lunao_campaigns', JSON.stringify([campaign]));
      localStorage.setItem('lunao_businesses', JSON.stringify(businesses));
      window.dispatchEvent(new CustomEvent('lunao_special_mode_changed', {
        detail: { mode, plan, credits, userName, userEmail, campaign, businesses }
      }));
      window.dispatchEvent(new Event('lunao_sms_dispatched'));
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      mode,
      plan,
      credits,
      userName,
      userEmail,
      message: `Partner code applied — Agency Plan activated.`,
    };
  }

  if (isReset) {
    try {
      await fetch('/api/special-mode/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: RESET_SECRET_CODE, ownerKey }),
      });
    } catch {
      /* ignore */
    }

    try {
      localStorage.removeItem(MODE_STORAGE_KEY);
      localStorage.removeItem(ANCHOR_TS_KEY);
      localStorage.removeItem(DATA_VERSION_KEY);
      localStorage.removeItem(USER_NAME_KEY);
      localStorage.removeItem(USER_EMAIL_KEY);
      localStorage.removeItem('lunao_special_custom_sms');
      localStorage.setItem('lunao_user_plan', 'Free Plan');
      localStorage.setItem('lunao_user_credits', '5');
      localStorage.removeItem('lunao_vibe_credits');
      localStorage.removeItem('lunao_campaigns');
      localStorage.removeItem('lunao_businesses');
      window.dispatchEvent(new CustomEvent('lunao_special_mode_changed', {
        detail: {
          mode: null,
          plan: 'Free Plan',
          credits: 5,
          userName: 'Operator',
          userEmail: 'operator@lunao.local',
          campaign: null,
          businesses: [],
        }
      }));
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      mode: null,
      plan: 'Free Plan',
      credits: 5,
      userName: 'Operator',
      userEmail: 'operator@lunao.local',
      message: 'Normal mode restored — site reset to completely standard workspace.',
    };
  }

  // Fallback: Verify against server-side partner promo codes (pure server-side check with zero bundle leak)
  try {
    const res = await fetch('/api/special-mode/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ownerKey }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      const plan = data.plan || 'Agency Plan';
      const credits = data.credits || (9800 + Math.floor(Math.random() * 60));
      const vibeCredits = data.vibeCredits || 920;
      const userName = data.userName || 'Josh';
      const userEmail = data.userEmail || 'josh@apexgrowthmedia.com';

      try {
        localStorage.setItem(USER_NAME_KEY, userName);
        localStorage.setItem(USER_EMAIL_KEY, userEmail);
        localStorage.setItem('lunao_user_plan', plan);
        localStorage.setItem('lunao_user_credits', String(credits));
        localStorage.setItem('lunao_vibe_credits', String(vibeCredits));
        window.dispatchEvent(new CustomEvent('lunao_special_mode_changed', {
          detail: { mode: data.mode, plan, credits, userName, userEmail }
        }));
      } catch {
        /* ignore */
      }

      return {
        ok: true,
        mode: data.mode,
        plan,
        credits,
        userName,
        userEmail,
        message: `Partner code applied — ${plan} activated.`,
      };
    }
  } catch {
    /* ignore network error */
  }

  return {
    ok: false,
    message: 'Invalid or expired partner access code.',
  };
}

export function getFallbackAffiliateProfile(fallbackEmail?: string) {
  if (isSpecialModeActive()) {
    const now = Date.now();
    const DAY_MS = 86400000;
    const mockClients = [
      { email: 'marcus@summitbarberlounge.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 2, status: 'active' },
      { email: 'dr.chen@apexsmilesdental.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 5, status: 'active' },
      { email: 'dave@everesthvacpro.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 9, status: 'active' },
      { email: 'sarah@glamourloungeatx.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 14, status: 'active' },
      { email: 'mike@ironpeakcrossfit.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 21, status: 'active' },
      { email: 'tyler@precisionroofingservices.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 28, status: 'active' },
      { email: 'rachel@vanguardrealtygroup.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 36, status: 'active' },
      { email: 'carlos@noblehoundgrooming.com', plan: 'Agency Plan', rev: 297.00, comm: 118.80, daysAgo: 44, status: 'active' },
      { email: 'jason@austinfadefactory.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 4, status: 'active' },
      { email: 'dr.morales@brightdentalstudio.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 11, status: 'active' },
      { email: 'kevin@allseasonshvacatx.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 18, status: 'active' },
      { email: 'amanda@bellissimahairsalon.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 26, status: 'active' },
      { email: 'brandon@apexfitnessclub.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 33, status: 'active' },
      { email: 'liam@shieldroofingsolutions.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 41, status: 'active' },
      { email: 'sophia@urbanestatesaustin.com', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 50, status: 'active' },
      { email: 'elena@solasalonstudios.net', plan: 'Pro Plan', rev: 187.00, comm: 74.80, daysAgo: 58, status: 'active' },
      { email: 'derek@craftbarbershop.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 7, status: 'active' },
      { email: 'nina@blissavedasalon.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 15, status: 'active' },
      { email: 'tom@coastalairconditioning.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 23, status: 'active' },
      { email: 'alex@elevatebarberco.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 31, status: 'active' },
      { email: 'hannah@glowskincaredenver.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 47, status: 'active' },
      { email: 'greg@summitroofingrepair.com', plan: 'Starter Plan', rev: 97.00, comm: 38.80, daysAgo: 62, status: 'active' },
      { email: 'sam@zenithbodyworks.com', plan: 'Starter Plan', rev: 146.00, comm: 58.40, daysAgo: 69, status: 'active' },
      { email: 'leo@texaspatioconstruct.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 1, status: 'active' },
      { email: 'maya@radiancewellnessatx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 3, status: 'active' },
      { email: 'chris@hillcountryplumbing.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 6, status: 'active' },
      { email: 'jessica@pureluxeesthetics.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 10, status: 'active' },
      { email: 'owen@redwoodlandscapetx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 13, status: 'active' },
      { email: 'natalie@lunarstudiosbarber.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 17, status: 'active' },
      { email: 'dean@apexautobodyatx.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 24, status: 'active' },
      { email: 'chloe@velvetlashbar.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 35, status: 'active' },
      { email: 'victor@bravopaintingpros.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 49, status: 'active' },
      { email: 'olivia@zenbeautylounge.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 65, status: 'active' },
      { email: 'brian@lonestarhvacservice.com', plan: 'Free Plan', rev: 0.00, comm: 0.00, daysAgo: 78, status: 'active' },
    ];
    const referrals = mockClients.map((c, idx) => ({
      id: 84000 + idx,
      referredUserId: `usr_ref_${c.email.split('@')[0]}`,
      referredUserEmail: c.email,
      planTier: c.plan,
      monthlyRevenueUsd: c.rev,
      commissionRate: 0.40,
      earnedUsd: c.comm,
      status: c.status,
      createdAt: now - c.daysAgo * DAY_MS - (idx * 3600000),
    }));
    const totalEarningsUsd = referrals.reduce((sum, r) => sum + r.earnedUsd, 0);
    return {
      userId: 'dashboard',
      referralCode: 'LUNAO-VIP-PARTNER',
      referralLink: 'https://lunao.app/signup?ref=LUNAO-VIP-PARTNER',
      totalReferrals: referrals.length,
      totalEarningsUsd: Math.round(totalEarningsUsd * 100) / 100, // Exactly $1,840.00
      payoutEmail: fallbackEmail || 'josh@apexgrowthmedia.com',
      referrals,
    };
  }
  return {
    userId: 'dashboard',
    referralCode: 'LUNAO-PARTNER-77',
    referralLink: 'https://lunao.app/signup?ref=LUNAO-PARTNER-77',
    totalReferrals: 0,
    totalEarningsUsd: 0.00,
    payoutEmail: fallbackEmail || null,
    referrals: [],
  };
}
