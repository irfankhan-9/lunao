export type NavSection =
  | 'dashboard'
  | 'bookings'
  | 'customers'
  | 'chat'
  | 'ai_receptionist'
  | 'website'
  | 'automations'
  | 'email'
  | 'settings';

export interface BusinessTheme {
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentBorder: string;
  surface: string;
  radius: 'sm' | 'md' | 'lg' | 'xl';
  displayFont?: string;
  bodyFont?: string;
}

export interface BusinessFeatures {
  booking: boolean;
  chatbot: boolean;
  email: boolean;
  automations: boolean;
}

export interface SocialLinks {
  instagram?: string | null;
  facebook?: string | null;
  googleMaps?: string | null;
  twitter?: string | null;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface AIReceptionistSettings {
  enabled: boolean;
  greeting: string;
  tone: 'professional' | 'warm' | 'friendly' | 'concise';
  businessDescription: string;
  businessHours: string;
  locationDetails: string;
  faqs: FAQItem[];
  policies: string;
  bookingEnabled: boolean;
  bookingInstructions: string;
  infoToCollect: string[];
  confirmationBehavior: string;
  doNotClaim: string;
  escalationGuidance: string;
}

export interface WebsiteConfig {
  url: string;
  status: 'deployed' | 'draft' | 'deploying';
  lastUpdated: string | null;
  lastDeployed: string | null;
  headline: string;
  subheadline: string;
  heroImage: string;
  ctaText?: string;
  announcement?: string;
}

export interface TenantBusiness {
  id: string;
  lunaoCode: string;
  slug: string;
  authToken?: string;
  name: string;
  niche: string;
  tagline?: string | null;
  logoUrl?: string | null;
  favicon?: string | null;
  phone: string;
  email: string;
  address: string;
  city: string;
  timezone: string;
  websiteUrl: string;
  socialLinks: SocialLinks;
  theme: BusinessTheme;
  features: BusinessFeatures;
  aiSettings: AIReceptionistSettings;
  websiteConfig: WebsiteConfig;
}

export type BookingStatus = 'confirmed' | 'completed' | 'cancelled';
export type BookingSource = 'Website' | 'AI Receptionist' | 'Form' | 'Direct' | null;

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  service: string | null;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:30 AM"
  durationMinutes?: number | null;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  bookingCount: number;
  lastBookingDate: string | null;
  lastService: string | null;
  notes: string | null;
  createdAt: string;
  recentBookings?: Booking[];
}

export interface ChatMessage {
  id: string;
  sender: 'visitor' | 'ai';
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  customerIdentifier: string;
  customerPhone: string | null;
  customerEmail: string | null;
  lastMessage: string;
  timestamp: string;
  resultingBookingId: string | null;
  messages: ChatMessage[];
}

export type AutomationTrigger =
  | 'booking_created'
  | 'booking_upcoming'
  | 'appointment_completed'
  | 'no_booking_days';

export interface AutomationTimingConfig {
  timingType: 'instant' | 'hours_before' | 'after_appointment' | 'inactivity_days';
  value: number; // e.g. 0 for instant, 24 for 24h before, 2 for 2 hours/days, 45 for 45 days
  unit: 'minutes' | 'hours' | 'days';
}

export interface AutomationStep {
  id: string;
  type: 'trigger' | 'wait' | 'action';
  label: string;
  description: string;
  waitDuration?: string;
  channel?: 'email';
}

export interface Automation {
  id: string;
  templateId:
    | 'booking_confirmation'
    | 'appointment_reminder'
    | 'day_of_reminder'
    | 'post_appointment_followup'
    | 'no_show_followup'
    | 'customer_reactivation'
    | 'vip_appreciation'
    | 'booking_cancellation'
    | string;
  name: string;
  description: string;
  trigger: string;
  timing: AutomationTimingConfig;
  actions: string[];
  steps: AutomationStep[];
  emailSubject: string;
  emailBody: string;
  enabled: boolean;
  lastExecutedAt: string | null;
  executionCount: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category:
    | 'booking_confirmation'
    | 'appointment_reminder'
    | 'day_of_reminder'
    | 'booking_cancellation'
    | 'thank_you'
    | 'post_appointment_followup'
    | 'no_show'
    | 'special_offer'
    | 'reactivation'
    | 'vip_appreciation'
    | 'general_announcement'
    | 'custom'
    | string;
  subject: string;
  body: string;
}

export interface EmailActivityRecord {
  id: string;
  recipientName: string;
  recipientEmail: string;
  templateName: string;
  subject: string;
  sentAt: string;
  status: 'delivered' | 'sent';
}

export interface ConnectedEmailAccount {
  email: string;
  provider: 'gmail' | 'workspace' | 'relay';
  status: 'active' | 'expired' | 'disconnected';
  connectedAt: string;
  expiresAt?: string;
  lastCheckedAt?: string;
  dailyQuotaRemaining?: number;
}

export interface Integration {
  id: string;
  provider: 'calendar_sync' | 'email_provider' | 'webhook_relay';
  name: string;
  description: string;
  status: 'connected' | 'not_connected' | 'connecting' | 'error';
  connectedAccount?: string | null;
  lastSync?: string | null;
}

export interface DashboardStats {
  todayBookingsCount: number;
  upcomingBookingsCount: number;
  totalCustomersCount: number;
  activeAutomationsCount: number;
}

export interface ActivityEvent {
  id: string;
  type:
    | 'booking_created'
    | 'booking_confirmed'
    | 'booking_cancelled'
    | 'website_deployed'
    | 'website_updated'
    | 'automation_executed'
    | 'email_sent';
  title: string;
  timestamp: string;
  description?: string;
}

export interface Review {
  id: string;
  customerName: string;
  customerEmail?: string | null;
  rating: number; // 1 to 5
  service: string;
  comment: string;
  createdAt: string;
  source: 'Google' | 'Direct Feedback' | 'Website' | 'SMS Follow-up';
  status: 'published' | 'responded' | 'new';
  response?: string | null;
  respondedAt?: string | null;
}

export interface TenantSession {
  code: string;
  businessId: string;
  authenticatedAt: string;
  ownerName?: string;
}

export interface TenantDataState {
  business: TenantBusiness;
  bookings: Booking[];
  customers: Customer[];
  conversations: Conversation[];
  automations: Automation[];
  emailTemplates: EmailTemplate[];
  emailActivity: EmailActivityRecord[];
  reviews: Review[];
  integrations: Integration[];
  activities: ActivityEvent[];
  connectedEmail: ConnectedEmailAccount;
}
