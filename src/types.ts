export type CommandStatus = 'Active' | 'Completed' | 'Queued' | 'Crashed';
export type CampaignType = 'sms' | 'site-deploy' | 'email';
export type EmailCampaignType = 'email';

// Email Campaign related types
export type LeadSource = 'csv' | 'places_api';
export type EmailSource = 'csv' | 'crawler' | 'hunter';
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'bounced';
export type SendStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'skipped';
export type CampaignStatus = 'draft' | 'running' | 'completed' | 'paused' | 'cancelled';
export type AccountStatus = 'healthy' | 'warming_up' | 'needs_attention' | 'disconnected';
export type WarmupStage = 'stage_1' | 'stage_2' | 'stage_3' | 'steady';
export type EmailProvider = 'gmail' | 'outlook';

export interface Campaign {
  id: string;
  name: string;
  niche: string;
  leadsFound?: number;
  sites: number;
  smsSent: number;
  claimed: number;
  // For email campaigns: how many of the emails actually went out vs failed.
  emailsSent?: number;
  emailsFailed?: number;
  status: CommandStatus;
  createdAt: string;
  templateId: string;
  errorReason?: string;
  type?: CampaignType;
  // The server's id (different from the local optimistic id) so the UI can
  // re-fetch results later or link to a campaign detail page.
  serverCampaignId?: string;
  // Persisted per-site deploy outcomes for the Recent Campaigns cards.
  // Each entry mirrors what the live pipeline returned so the card can show
  // a copy-able URL and a "Live" badge without a backend round-trip.
  deployedSites?: CampaignDeployedSite[];
  // Per-lead outcomes for email campaigns — drives the rich Email card
  // in Recent Campaigns (prospect email, from-account, deployed URL, status).
  emailLeads?: CampaignEmailLead[];
  // Per-account delivery breakdown for email campaigns — drives the
  // "X emails from alice@gmail.com" stat strip on the recent card.
  emailAccountsUsed?: { accountId: string; accountEmail: string; sent: number; failed: number }[];
  sitesGenerated?: number;
}

export interface CampaignEmailLead {
  leadId?: string | number;
  name: string;
  email?: string;
  accountEmail?: string;
  siteUrl?: string;
  status: 'sent' | 'failed' | 'queued';
  reason?: string;
}

export interface CampaignDeployedSite {
  slug: string;
  name: string;
  city?: string;
  url: string;
  status: 'live' | 'failed';
  error?: string;
}

export interface Template {
  id: string;
  name: string;
  niche: string;
  usedCount: number;
  rating: number;
  tag?: string;
  isMostUsed?: boolean;
  // The raw HTML file under /public/templates-raw/ that the server should
  // compile when this template is selected. Without this, every selection
  // silently falls back to the default barber template.
  templateFile?: string;
}

export type WebStatus = 'No website' | 'Has website';
export type SiteStatus = 'Site generated' | 'SMS sent' | 'Converted' | 'Not started';

export interface SmsHistoryEntry {
  text: string;
  timestamp: string;
  type: 'outgoing' | 'incoming';
  // Real delivery state of an outgoing message. Drives the tick icon in the
  // Messages tab: 'pending' = no tick, 'sent' = single tick (sent to Telnyx),
  // 'delivered' = double tick (confirmed by Telnyx delivery report/webhook),
  // 'simulated' = no real SMS, 'failed' = red error icon.
  deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'simulated' | 'failed';
  // The Telnyx message id, present for real sends so we can poll the delivery
  // status. Null for simulated.
  telnyxId?: string | null;
}

export interface Business {
  id: string;
  name: string;
  owner: string;
  phone: string;
  city: string;
  niche: string;
  webStatus: WebStatus;
  siteStatus: SiteStatus;
  slug: string;
  smsHistory: SmsHistoryEntry[];
  siteUrl: string;
}

export type SmsStatus = 'Delivered' | 'Clicked' | 'Replied' | 'Undelivered' | 'Opted Out' | 'Coming Soon';

export interface SmsLog {
  id: string;
  businessName: string;
  phone: string;
  sentAt: string;
  status: SmsStatus;
  previewLink: string;
}

export type SidebarTab = 'dashboard' | 'campaigns' | 'templates' | 'editor' | 'messages' | 'settings' | 'plans';

export interface DeployedSite {
  slug: string;
  title: string;
  niche: string;
  url: string;
  updatedAt: number | null;
}

// ============================================================
// Email Campaign Types
// ============================================================

export interface EmailCampaign {
  id: string;
  userId: string;
  niche: string;
  templateId: string;
  leadSource: LeadSource;
  targetVolume: number;
  city: string;
  category: string;
  status: CampaignStatus;
  createdAt: string;
  // Counts
  leadsFound: number;
  emailsFound: number;
  sitesGenerated: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsBounced: number;
  emailsFailed: number;
  // Template customization
  emailSubject?: string;
  emailBody?: string;
  // Scheduling
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  // Cost
  creditsCharged: number;
  creditsRefunded: number;
}

export interface EmailLead {
  id: number;
  campaignId: string;
  businessName: string;
  phone: string;
  city: string;
  website: string;
  email: string;
  emailSource: EmailSource;
  verificationStatus: VerificationStatus;
  generatedSiteUrl: string;
  assignedAccountId: string;
  sendStatus: SendStatus;
  sentAt: number | null;
  createdAt: number;
}

export interface ConnectedEmailAccount {
  id: string;
  userId: string;
  provider: EmailProvider;
  email: string;
  displayName: string;
  dailyCap: number;
  connectedAt: number;
  status: AccountStatus;
  warmupStage: WarmupStage;
  // Usage metrics
  sendsToday: number;
  sendsThisWeek: number;
  remainingToday: number;
  // Health metrics
  bounceRate7d: number;
  lastSuccessfulSend: number | null;
  // Token info (client-side only gets masked version)
  tokenStatus: 'active' | 'needs_reconnect' | 'revoked';
}

export interface EmailSendLog {
  id: number;
  leadId: number;
  campaignId: string;
  accountId: string;
  sentAt: number;
  deliveryStatus: SendStatus;
  bounceStatus: 'clean' | 'hard' | 'soft' | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AccountHealthMetrics {
  accountId: string;
  status: AccountStatus;
  warmupStage: WarmupStage;
  daysConnected: number;
  sendsToday: number;
  dailyCap: number;
  remainingToday: number;
  bounceRate7d: number;
  lastSuccessfulSend: number | null;
  recommendation: string;
}

export interface EmailCampaignSummary {
  id: string;
  niche: string;
  templateId: string;
  leadSource: LeadSource;
  targetVolume: number;
  city: string;
  status: CampaignStatus;
  leadsFound: number;
  emailsFound: number;
  sitesGenerated: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsBounced: number;
  emailsFailed: number;
  creditsCharged: number;
  creditsRefunded: number;
  startedAt: number;
  completedAt: number | null;
}

export interface PlacesApiResult {
  name: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  placeId: string;
}

export interface HunterApiResult {
  email: string;
  confidence: number;
  source: string;
  domain: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  previewUrl: string;
}

// Suppression list entry
export interface SuppressionEntry {
  id: number;
  email: string;
  reason: 'unsubscribed' | 'bounced' | 'complained';
  createdAt: number;
  source: 'manual' | 'webhook';
}
