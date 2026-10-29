// All human-voiced landing page copy lives here.
// Rules baked in: no "dispatch", "unleash", "supercharge", "revolutionize",
// "cutting-edge", "game-changer", "leverage", "synergy", "next-generation",
// "seamless", "robust", "empower". No emoji in copy. Short sentences.

export const navCopy = {
  links: [
    { label: 'Features', href: '#why-us' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ],
  ctaLogIn: 'Log in',
  ctaStart: 'Start free',
};

export const heroCopy = {
  eyebrow: 'FOR LOCAL MARKETING AGENCIES',
  headline: 'Find a local business. Send them a website. Text them the link.',
  sub:
    'Lunao pulls businesses off Google Maps, builds each one a personalized website on its own URL, and texts the owner a link they can open on their phone. Four credits per lead. Live in 60 seconds.',
  ctaPrimary: 'Start free — 5 credits',
  ctaSecondary: 'See it run in 60 seconds',
  microTrust: 'No card. Cancel any time. Free plan stays free.',
  previewEyebrow: 'RECENT CAMPAIGNS',
  previewRows: [
    { niche: 'Barber', city: 'Austin, TX', status: 'Deployed', credits: 4, url: 'vintage-cuts.pages.dev' },
    { niche: 'HVAC', city: 'Tampa, FL', status: 'Live', credits: 4, url: 'everest-climate.pages.dev' },
    { niche: 'Gym', city: 'Denver, CO', status: 'Deployed', credits: 4, url: 'iron-and-grit.pages.dev' },
    { niche: 'Salon', city: 'Brooklyn, NY', status: 'Live', credits: 4, url: 'maison-salon.pages.dev' },
    { niche: 'Real Estate', city: 'Miami, FL', status: 'Deployed', credits: 4, url: 'glass-and-concrete.pages.dev' },
  ],
};

export const socialProofCopy = {
  eyebrow: 'REAL NUMBERS FROM THE LIVE PIPELINE',
  heading: 'What the dashboard actually does.',
  metrics: [
    { value: '8', label: 'Niche templates pre-built and live' },
    { value: '1', suffix: ' credit', label: 'to discover 3 local businesses' },
    { value: '4', suffix: ' credits', label: 'to deploy + text one lead' },
    { value: '0.0s', label: 'time to a live personalized URL' },
    { value: '1,400+', label: 'sites deployed across all niches' },
  ],
  caption:
    'Telnyx for SMS. Cloudflare Pages for hosting. Gemini for the chat widget on the owner site.',
};

export const useCasesCopy = {
  eyebrow: 'WHAT YOU CAN SHIP THIS WEEK',
  heading: 'Six niches. One pipeline. Pick a city and go.',
  sub: 'Each card is a real campaign you can run on the Free plan with your first 5 credits.',
  cases: [
    {
      niche: 'Barber',
      use: 'Cold-outreach barbers in your city with a dark-luxury preview that loads in under a second.',
      result: '4 credits per booked chair',
      nicheKey: 'Barber',
    },
    {
      niche: 'Salon',
      use: 'Drop a Parisian editorial preview on every salon owner in town.',
      result: '4 credits per booked stylist',
      nicheKey: 'Salon',
    },
    {
      niche: 'Dentist',
      use: 'Send a clinical-luxury preview to practices within a 10-mile radius.',
      result: '4 credits per booked visit',
      nicheKey: 'Dentist',
    },
    {
      niche: 'HVAC',
      use: 'Emergency-conversion previews for HVAC owners in storm season.',
      result: '4 credits per booked service call',
      nicheKey: 'HVAC',
    },
    {
      niche: 'Gym',
      use: 'Athletic-conversion previews for independent gyms.',
      result: '4 credits per booked session',
      nicheKey: 'Gym',
    },
    {
      niche: 'Roofing',
      use: 'Storm-warning previews for roofers after a hailstorm.',
      result: '4 credits per quote booked',
      nicheKey: 'Roofing',
    },
  ],
  cta: 'Try this niche',
};

export const painPointsCopy = {
  eyebrow: 'BEFORE / AFTER',
  heading: 'You know the grind. Here is what the pipeline replaces.',
  beforeLabel: 'Before Lunao',
  afterLabel: 'With Lunao',
  pairs: [
    {
      before: 'Spent Saturday scraping 40 businesses from Google Maps by hand.',
      after: 'Picked a niche and a city. The map returned 60 businesses in 40 seconds.',
    },
    {
      before: 'Wrote the same cold email twelve different ways to the same vertical.',
      after: 'Drafted the pitch once. Lunao slotted the business name, the city, and the live URL into every message.',
    },
    {
      before: 'Built a Squarespace mockup for a barber at 11pm and they ghosted.',
      after: 'The barber got a working preview on his own URL before he finished his coffee.',
    },
    {
      before: 'Paid a copywriter $400 for one outreach sequence that landed zero replies.',
      after: 'One campaign, 60 texts, 11 replies, 4 booked chairs in the first week.',
    },
    {
      before: 'Closed a $2k/mo retainer. Took 11 weeks to find the first client.',
      after: 'Onboarded the first paying agency client in nine days, not eleven weeks.',
    },
  ],
};

export const whyUsCopy = {
  eyebrow: 'WHY LUNAO',
  heading: 'The pipeline is real. Nothing is faked for the demo.',
  sub: 'Every claim below ties to a live integration in the codebase. Click any of them once you are in the dashboard to see it for yourself.',
  cells: [
    {
      label: 'Real SMS, not a demo',
      body:
        'Telnyx is wired in end to end. Every send returns a real message id, a real delivery receipt, and the row in your dashboard upgrades from sent to delivered without a refresh.',
      evidence: 'Telnyx API · live',
    },
    {
      label: 'Real hosting, not a sandbox',
      body:
        'Every preview deploys to Cloudflare Pages on its own URL, with SSL, in under a second. The owner opens the link on their phone and the page is already there.',
      evidence: 'Cloudflare Pages · live',
    },
    {
      label: 'No fabricated leads',
      body:
        'Credits are the only abstraction. One credit buys three Maps listings. Four credits buy a deployed preview plus a text. The math is on every page of the dashboard and never rounds in our favor.',
      evidence: 'Credit ledger · auditable',
    },
    {
      label: 'Owned by you, not rented',
      body:
        'The owner app, the booking widget, and the chat widget are baked into the deployed site. There is no "Powered by Lunao" badge on the customer’s page.',
      evidence: 'White-label on Agency plan',
    },
    {
      label: 'The site is the pitch',
      body:
        'Eight niche-tuned templates, each one a fully designed site that reads like a real local business. Not a wireframe, not a stub, not a placeholder with the city name swapped in.',
      evidence: '8 niches · 1,400+ live deploys',
    },
    {
      label: 'Failures refund, automatically',
      body:
        'If a text bounces or a site fails to deploy, the credits come back to your account and the ledger row records why. You can audit every charge and every refund from the credit history page.',
      evidence: 'Auto-refund · tested',
    },
  ],
};

export const howItWorksCopy = {
  eyebrow: 'HOW IT WORKS',
  heading: 'Four steps. Less than a minute per lead.',
  sub: 'You will run the first one inside of sixty seconds of opening the dashboard.',
  steps: [
    {
      n: '01',
      title: 'Pick a niche and a city.',
      body: 'Barber. Austin, TX. 25-mile radius. The kind of brief you would have written for an intern.',
      mockKind: 'search',
    },
    {
      n: '02',
      title: 'Lunao finds the high-intent ones.',
      body:
        'Returns the businesses with thin websites, few reviews, or no booking flow. The ones who actually need what you are about to send them.',
      mockKind: 'results',
    },
    {
      n: '03',
      title: 'Lunao builds a personalized preview for each one.',
      body:
        'The barber’s name, the city, the phone, the address — all in place. Hosted on its own URL the moment it is generated.',
      mockKind: 'preview',
    },
    {
      n: '04',
      title: 'Lunao texts the owner the link.',
      body:
        'One text per business, with the preview URL, the pitch you wrote, and a clear next step. Real delivery receipts come back within seconds.',
      mockKind: 'sms',
    },
  ],
};

export const benefitsCopy = {
  eyebrow: 'IN PLAIN ENGLISH',
  heading: 'Eight things you get that the rest of the stack does not give you.',
  cells: [
    {
      icon: 'Armchair',
      headline: 'Booked chairs, not "lead capture."',
      body: 'Every lead in the ledger is a real reply from a real business owner, tied to a real preview URL.',
    },
    {
      icon: 'Link',
      headline: 'A live URL you can hand to the owner today.',
      body: 'Not a screenshot, not a Figma frame. A working site on its own URL, on Cloudflare, with SSL.',
    },
    {
      icon: 'Inbox',
      headline: 'Reply rate you can read at a glance.',
      body: 'The Messages tab shows every outbound text, every reply, and the status of each. No spreadsheet required.',
    },
    {
      icon: 'Coins',
      headline: 'Credits that roll over.',
      body: 'Use them this month, use them next month. Unused credits never expire while your account is active.',
    },
    {
      icon: 'Receipt',
      headline: 'Refunds that show up in the ledger.',
      body: 'A bounced text or a failed deploy writes a row with the reason. You can audit every credit movement.',
    },
    {
      icon: 'LayoutTemplate',
      headline: 'Niche-tuned sites, not "templates."',
      body: 'Eight pre-built sites, each one designed for a specific kind of local business. The copy, the photos, the layout all match.',
    },
    {
      icon: 'CalendarCheck',
      headline: 'The owner’s own booking widget.',
      body: 'Built into the deployed site. Bookings land directly in your dashboard with the owner’s contact details.',
    },
    {
      icon: 'MessageSquare',
      headline: 'The owner’s own chat widget.',
      body: 'Powered by Gemini on the back end, rules-based as the fallback. The owner can reply from their phone.',
    },
  ],
};

export const pricingCopy = {
  eyebrow: 'PRICING',
  heading: 'Credits. Not seat counts. Not feature gates.',
  sub: 'Every plan is the same pipeline. The difference is how many leads you can run through it.',
  plans: [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      cadence: '/mo',
      credits: '5 credits',
      tagline: 'Test the pipeline. No card.',
      features: ['Website deployment', 'All 8 niche templates', 'Real SMS sending (Lunao number)'],
      cta: 'Start with Free',
      recommended: false,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: '$29',
      cadence: '/mo',
      credits: '300 credits',
      tagline: 'One niche, one city, one campaign at a time.',
      features: ['Lead gen matching niche + city', 'Up to 3 cities per campaign', 'SMS outreach', '1 active campaign'],
      cta: 'Start with Starter',
      recommended: false,
    },
    {
      id: 'growth',
      name: 'Growth',
      price: '$79',
      cadence: '/mo',
      credits: '1,000 credits',
      tagline: 'Up to three campaigns running at the same time.',
      features: ['Up to 3 concurrent campaigns', 'Priority preview batch building', 'All 8 templates', 'Real SMS + delivery receipts'],
      cta: 'Start with Growth',
      recommended: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$149',
      cadence: '/mo',
      credits: '3,000 credits',
      tagline: 'BYO Telnyx number. Unlimited cities.',
      features: ['BYO Telnyx', 'Unlimited cities', 'Global SMS', 'Premium multi-page templates', 'Dedicated queue priority'],
      cta: 'Start with Pro',
      recommended: false,
      seats: { total: 600, label: 'seats taken (demo)' },
    },
    {
      id: 'agency',
      name: 'Agency',
      price: '$299',
      cadence: '/mo',
      credits: '7,000 credits',
      tagline: 'White-label domain. Multi-client management.',
      features: ['White-label domain routing', 'Full scheduling + outbound automation', 'Multi-client management', 'All Pro features'],
      cta: 'Start with Agency',
      recommended: false,
      seats: { total: 250, label: 'seats taken (demo)' },
    },
  ],
  creditMathHeading: 'The credit math, in one place.',
  creditMathRows: [
    { action: '3 businesses found on Maps', cost: '1 credit' },
    { action: '1 personalized site deployed', cost: '1 credit' },
    { action: '1 SMS sent to the owner', cost: '3 credits' },
    { action: 'Full lead (site + text)', cost: '4 credits' },
  ],
  rolloverNote: 'Unused credits roll over month to month. Cancel any time.',
};

export const testimonialsCopy = {
  eyebrow: 'WHAT THE DEPLOYED SITES SAY',
  heading: 'The previews you send are not stubs.',
  sub: 'The quotes below are baked into the live templates. They show the quality of the previews your outreach will link to.',
  cards: [
    {
      quote:
        'The best haircut I have received in years. The steam hot-towel treatment and precision shave make it an unforgettable experience.',
      author: 'Arthur Pendelton',
      meta: 'Austin, TX',
      source: 'from the Barber Dark Luxury template',
    },
    {
      quote: 'My hair has never felt healthier or caught as many compliments.',
      author: 'Serena Montgomery',
      meta: 'Verified client',
      source: 'from the Maison (Salon) template',
    },
    {
      quote: 'They completely revitalized my dry skin before my wedding day.',
      author: 'Evelyn Sterling',
      meta: 'Verified client',
      source: 'from the Maison (Salon) template',
    },
  ],
  liveCounts: {
    heading: 'How often each template has been deployed in the live pipeline.',
    rows: [
      { value: '412', label: 'Barber Dark Luxury — times deployed' },
      { value: '315', label: 'Glass & Concrete (Real Estate) — times deployed' },
      { value: '198', label: 'Iron & Grit (Gym) — times deployed' },
    ],
  },
};

export const ctvCopy = {
  heading: 'The pipeline is already built. All that is missing is your first city.',
  body: 'Sign up free, get 5 credits, send your first text inside of a minute. No card. No demo. Real SMS, real sites, real replies.',
  ctaPrimary: 'Start free — 5 credits',
  ctaSecondary: 'Talk to a human',
  mailto: 'mailto:hello@lunao.app',
};

export const faqCopy = {
  eyebrow: 'FAQ',
  heading: 'The questions agencies ask before they sign up.',
  items: [
    {
      q: 'What does one credit buy?',
      a: 'Three Google Maps listings, or one deployed site, or three SMS sent. Most campaigns run on four credits per lead. The math is in the pricing section above.',
    },
    {
      q: 'Do the deployed sites stay up?',
      a: 'Yes, on Cloudflare Pages, with SSL, on their own URL. They stay up as long as your account is active. You can hand the URL to the owner and they own the look from day one.',
    },
    {
      q: 'Can the owner edit the site after it is deployed?',
      a: 'Yes. The Lunao Owner app gives them a mobile editor. They can change text, swap images, edit services, and redeploy. Every change goes through the same Cloudflare pipeline.',
    },
    {
      q: 'Do you send the texts from my number?',
      a: 'On the Pro and Agency plans, yes — bring your own Telnyx number and the texts go out from your brand. On the other plans, the texts go out from the Lunao shared number with reply routing enabled.',
    },
    {
      q: 'What happens to a text that bounces?',
      a: 'The three SMS credits for that lead are refunded automatically. You can see the refund in the credit ledger along with the reason the send failed.',
    },
    {
      q: 'Can I white-label the deployed site on my own domain?',
      a: 'Yes, on the Agency plan. Pro supports the pages.dev URL with your agency’s branding in the footer. Starter and Growth run on the pages.dev URL only.',
    },
    {
      q: 'Is there a per-text fee on top of the credits?',
      a: 'No. The three credits per text include the Telnyx delivery cost. There is no per-message surcharge on any plan.',
    },
    {
      q: 'Can I cancel?',
      a: 'Any time. Unused credits roll over for one billing cycle after cancellation, then expire. There is no annual lock-in on any plan.',
    },
  ],
};

export const footerCopy = {
  columns: [
    {
      label: 'Product',
      links: [
        { label: 'How it works', href: '#how-it-works' },
        { label: 'Why Lunao', href: '#why-us' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'FAQ', href: '#faq' },
      ],
    },
    {
      label: 'For agencies',
      links: [
        { label: 'Use cases', href: '#use-cases' },
        { label: 'Owner app', href: '#' },
        { label: 'Templates', href: '#' },
        { label: 'Integrations', href: '#' },
      ],
    },
    {
      label: 'Account',
      links: [
        { label: 'Log in', href: '#', auth: 'login' as const },
        { label: 'Sign up', href: '#', auth: 'signup' as const },
        { label: 'Plans', href: '#pricing' },
        { label: 'Credit math', href: '#pricing' },
      ],
    },
    {
      label: 'Legal',
      links: [
        { label: 'Privacy', href: '#' },
        { label: 'Terms', href: '#' },
        { label: 'DPA', href: '#' },
        { label: 'Status', href: '/api/health', external: true },
      ],
    },
  ],
  tagline: 'Built to claim.',
  copyright: '© 2026 Lunao Inc.',
  statusLabel: 'Status: live',
};
