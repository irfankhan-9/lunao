import { Campaign, Template, Business, SmsLog } from './types';

// No mock campaigns — real campaigns are created by running the live pipeline
// and persisted via localStorage (see App.tsx).
export const initialCampaigns: Campaign[] = [];

// Built-in templates. The `id` here is the canonical template key used
// everywhere — picker, launch payload, campaign card, preview iframe.
// The server (server/lib/templates.js) is the source of truth for which
// raw HTML file each key maps to. Adding a new built-in is a one-line
// change on the server + dropping the HTML file in /public/templates-raw/.
export const initialTemplates: Template[] = [
  {
    id: 'barber-dark-luxury',
    name: 'Barber Dark Luxury',
    niche: 'Barber',
    usedCount: 412,
    rating: 4.9,
    tag: 'Premium Luxury',
    isMostUsed: true,
    emoji: '💈',
    description: 'Dark luxury Italian-meets-modern editorial. Playfair serif, warm gold accents.',
  },
  {
    id: 'barber-editorial',
    name: 'The Editorial',
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
    name: 'Maison',
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
    name: 'Clarity',
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
    name: 'Ironclad',
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
    name: 'Everest Climate',
    niche: 'HVAC',
    usedCount: 142,
    rating: 5.0,
    tag: 'Emergency Conversion Engine',
    isMostUsed: true,
    emoji: '❄️',
    description: 'Emergency conversion engine. Hot/cold contrasting sliders, instant dispatch maps.',
  },
  {
    id: 'gym-iron-grit',
    name: 'Iron & Grit',
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
    name: 'Glass & Concrete',
    niche: 'Real Estate',
    usedCount: 315,
    rating: 4.9,
    tag: 'Premium Brokerage',
    isMostUsed: true,
    emoji: '🏡',
    description: 'Premium brokerage. Full-bleed listings, agent wall, glass-and-concrete palette.',
  }
];

// No mock businesses — populated for real from live campaign deployments.
export const initialBusinesses: Business[] = [];

// No mock SMS logs — populated for real once SMS is live (Coming Soon).
export const initialSmsLogs: SmsLog[] = [];

// No mock activity feed.
export const activitiesLog: { text: string; time: string; type: string }[] = [];

export const nicheList = [
  { id: 'Barber', emoji: '💈', label: 'Barber' },
  { id: 'Salon', emoji: '💅', label: 'Salon' },
  { id: 'Dentist', emoji: '🦷', label: 'Dentist' },
  { id: 'HVAC', emoji: '❄️', label: 'HVAC' },
  { id: 'Gym', emoji: '💪', label: 'Gym' },
  { id: 'Roofing', emoji: '🏠', label: 'Roofing' },
  { id: 'Real Estate', emoji: '🏡', label: 'Real Estate' },
];
