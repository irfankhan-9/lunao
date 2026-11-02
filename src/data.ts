import { Campaign, Template, Business, SmsLog } from './types';
import { mockCampaigns, mockBusinesses, mockSmsLogs, mockActivitiesLog } from './data/mockData';

export { mockCampaigns, mockBusinesses, mockSmsLogs, mockActivitiesLog };

// Standalone Mock Mode: Auto-active in AI Studio, WebContainers, or when VITE_STANDALONE_MOCK='true'
export const IS_MOCK_ENV = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_STANDALONE_MOCK === 'true') ||
  (typeof window !== 'undefined' && (
    window.location.hostname.includes('webcontainer') || 
    window.location.hostname.includes('aistudio') || 
    window.location.hostname.includes('run.app') || 
    window.location.hostname.includes('googleusercontent.com') || 
    window.location.hostname.includes('stackblitz')
  ));

// Populated with rich mock campaigns when in AI Studio / Mock mode, clean empty in production
export const initialCampaigns: Campaign[] = IS_MOCK_ENV ? mockCampaigns : [];

// Built-in templates. The `id` here is the canonical template key used
// everywhere — picker, launch payload, campaign card, preview iframe.
// The server (server/lib/templates.js) is the source of truth for which
// raw HTML file each key maps to. Adding a new built-in is a one-line
// change on the server + dropping the HTML file in /public/templates-raw/.
import { SPECIAL_BARBER_RAW_HTML } from './specialModes/prebuiltBarberVibe';

export const initialTemplates: Template[] = [
  {
    id: 'barber-dark-luxury',
    name: 'Obsidian Blade — Barber Dark Luxury',
    niche: 'Barber',
    usedCount: 412,
    rating: 4.9,
    tag: 'Premium Luxury',
    isMostUsed: false,
    emoji: '💈',
    description: 'Dark luxury Italian-meets-modern editorial. Playfair serif, warm gold accents.',
  },
  {
    id: 'barber-editorial',
    name: 'Atelier — Barber Editorial',
    niche: 'Barber',
    usedCount: 221,
    rating: 4.8,
    tag: 'Editorial Brutalism',
    isMostUsed: false,
    emoji: '💈',
    description: 'High-contrast brutalist editorial with serif italics and sharp dividers.',
  },
  {
    id: 'salon-maison',
    name: 'Maison — Luxury Hair & Beauty Salon',
    niche: 'Salon',
    usedCount: 189,
    rating: 4.9,
    tag: 'Parisian Editorial',
    isMostUsed: false,
    emoji: '💅',
    description: 'Parisian editorial warmth with soft pastels and high-fashion containers.',
  },
  {
    id: 'dentist-clarity',
    name: 'Clarity — Modern Cosmetic & Family Dentistry',
    niche: 'Dentist',
    usedCount: 154,
    rating: 4.9,
    tag: 'Clinical Luxury',
    isMostUsed: true,
    emoji: '🦷',
    description: 'Clinical luxury dental studio. Trust badges, automated scheduling anchors.',
  },
  {
    id: 'roofing-ironclad',
    name: 'Ironclad — Storm & Exterior Roofing',
    niche: 'Roofing',
    usedCount: 78,
    rating: 4.9,
    tag: 'Industrial Authority',
    isMostUsed: false,
    emoji: '🏠',
    description: 'Industrial authority with steel-blue palette and project-grade trust badges.',
  },
  {
    id: 'hvac-everest',
    name: 'Everest — Climate & Mechanical Systems',
    niche: 'HVAC',
    usedCount: 142,
    rating: 5.0,
    tag: 'Emergency Conversion Engine',
    isMostUsed: false,
    emoji: '❄️',
    description: 'Emergency conversion engine. Hot/cold contrasting sliders, instant dispatch maps.',
  },
  {
    id: 'hvac-bespoke',
    name: 'Bespoke — Architectural Climate & HVAC',
    niche: 'HVAC',
    usedCount: 176,
    rating: 5.0,
    tag: 'Bespoke Luxury Architecture',
    isMostUsed: true,
    emoji: '❄️',
    description: 'Bespoke climate engineering & luxury architectural HVAC. Concealed slot diffusers, hospital-grade air purity, and gold aesthetic.',
  },
  {
    id: 'gym-iron-grit',
    name: 'Iron Grit — Performance & Strength Club',
    niche: 'Gym',
    usedCount: 198,
    rating: 4.9,
    tag: 'Athletic Conversion Machine',
    isMostUsed: true,
    emoji: '💪',
    description: 'Athletic conversion machine. High-impact hero, membership tiers, transformation wall.',
  },
  {
    id: 'realestate-glass',
    name: 'Glass — Luxury Real Estate & Brokerage',
    niche: 'Real Estate',
    usedCount: 315,
    rating: 4.9,
    tag: 'Premium Brokerage',
    isMostUsed: true,
    emoji: '🏡',
    description: 'Premium brokerage. Full-bleed listings, agent wall, glass-and-concrete palette.',
  }
];

// Populated with rich dummy data when in AI Studio / Mock mode
export const initialBusinesses: Business[] = IS_MOCK_ENV ? mockBusinesses : [];

// Populated with sample logs in Mock mode
export const initialSmsLogs: SmsLog[] = IS_MOCK_ENV ? mockSmsLogs : [];

// Populated with activity items in Mock mode
export const activitiesLog: { text: string; time: string; type: string }[] = IS_MOCK_ENV ? mockActivitiesLog : [];

export const nicheList = [
  { id: 'Barber', emoji: '💈', label: 'Barber' },
  { id: 'Salon', emoji: '💅', label: 'Salon' },
  { id: 'Dentist', emoji: '🦷', label: 'Dentist' },
  { id: 'HVAC', emoji: '❄️', label: 'HVAC' },
  { id: 'Gym', emoji: '💪', label: 'Gym' },
  { id: 'Roofing', emoji: '🏠', label: 'Roofing' },
  { id: 'Real Estate', emoji: '🏡', label: 'Real Estate' },
];
