// All human-voiced landing page copy lives here.
// Strictly NO AI slop words (no "delve", "harness", "leverage", "navigate",
// "empower", "elevate", "foster", "streamline", "optimize", "embark", "unveil",
// "facilitate", "robust", "pivotal", "seamless", "vibrant", "crucial", "vital",
// "transformative", "cutting-edge", "ever-evolving", "intricate", "multifaceted",
// "tapestry", "realm", "landscape", "beacon", "intersection", "paradigm",
// "ecosystem", "synergy", "testament", "plethora", "notably", "certainly",
// "subsequently", "seamlessly", "truly", "fundamentally", "arguably", "moreover",
// "additionally", "furthermore"). No emojis. Clean, direct human copy.

export const navCopy = {
  links: [
    { label: 'Value', href: '#use-cases' },
    { label: 'Comparison', href: '#pain' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ],
  ctaLogIn: 'Log in',
  ctaStart: 'Start free',
};

export const heroCopy = {
  eyebrow: 'LUNAO V2 AGENCY AUTOMATION SYSTEM',
  headline: 'The Automated System to Acquire, Keep, and Scale Your Web & AI Agency',
  sub:
    'We built Lunao to automate every service agencies sell to local businesses, starting with pixel-perfect websites, and expanding to AI and upcoming services. No repetitive vibe-coding. No wasted AI credits.',
  ctaPrimary: 'Start Free (15 Credits + 15 AI)',
  ctaSecondary: 'See How It Works',
  microTrust: '15 free Lunao credits + 15 free AI vibe-coding credits included • No credit card required • Setup in 60 seconds',
  previewEyebrow: 'LIVE PIPELINE OUTREACH',
  previewRows: [
    { niche: 'Barber', city: 'Austin, TX', status: 'Deployed', credits: 3, url: 'vintage-cuts.lunao.app' },
    { niche: 'HVAC', city: 'Tampa, FL', status: 'Live', credits: 3, url: 'everest-climate.lunao.app' },
    { niche: 'Gym', city: 'Denver, CO', status: 'Deployed', credits: 3, url: 'iron-and-grit.lunao.app' },
    { niche: 'Salon', city: 'Brooklyn, NY', status: 'Live', credits: 3, url: 'maison-salon.lunao.app' },
    { niche: 'Real Estate', city: 'Miami, FL', status: 'Deployed', credits: 3, url: 'glass-and-concrete.lunao.app' },
  ],
};

export const socialProofCopy = {
  eyebrow: 'AGENCY METRICS & SPEED',
  heading: 'Save 10x cost per site with 20x deployment speed.',
  metrics: [
    { value: '10x', label: 'Lower cost per deployed client website' },
    { value: '20x', label: 'Faster speed from search to live domain' },
    { value: '100%', label: 'Automated site rebranding & delivery' },
    { value: '15 + 15', suffix: ' credits', label: 'Free on sign-up: 15 Lunao credits + 15 AI vibe-coding credits' },
    { value: '700K+', label: 'Active websites deployed across niches' },
  ],
};

export const useCasesCopy = {
  eyebrow: 'WHAT YOU CAN SHIP THIS WEEK',
  heading: 'Your Future vs. Legacy Agency Workflow',
  sub:
    'Stop spending 20 minutes and $2+ in AI tokens vibe-coding 1 website for 1 business. Build 1 master template to pixel perfection once and Lunao rebrands it for 1,000s of target businesses in 1 click.',
  cases: [
    {
      niche: 'Single-Build Master Scale',
      use: 'Vibe-code 1 master template of 40 to 100 pages once. Lunao rebrands it for 100s of businesses in 1 click for less than $0.02.',
      result: 'Fixed cost < $0.02 per site',
      nicheKey: 'Barber',
    },
    {
      niche: 'Automated Outreach',
      use: 'Lunao replaces manual email drafting with hyper-personalized sequences containing local business name, city, and live custom preview link.',
      result: '1-click Email & SMS campaigns',
      nicheKey: 'Salon',
    },
    {
      niche: 'Mass Production Speed',
      use: 'Instead of spending 24 hours sending 10 unfinished mockups, spend 2 minutes running a campaign while 1,000s receive live production-grade sites.',
      result: '2 mins campaign setup time',
      nicheKey: 'Dentist',
    },
    {
      niche: 'Turnkey Client PWA',
      use: 'Close a client and generate an instant QR code for their owner PWA. They manage their own site edits, track bookings, and view client details.',
      result: 'Instant client portal & QR code',
      nicheKey: 'HVAC',
    },
  ],
  cta: 'Launch Campaign',
};

export const painPointsCopy = {
  eyebrow: 'BEFORE / WITH LUNAO',
  heading: 'Side-by-side: How Lunao replaces the manual agency grind.',
  beforeLabel: 'Before Lunao',
  afterLabel: 'With Lunao',
  pairs: [
    {
      before: 'Vibe code 1 site for 1 business spending time and money without even knowing if they are interested.',
      after: 'Vibe code 1 master site of 40 to 100 pages one time only. Lunao rebrands the same site for 100s of businesses with one click and fixed cost of less than $0.02.',
    },
    {
      before: 'Write cold emails manually twelve different ways to the same vertical.',
      after: 'Lunao automates the whole process and sends personalized emails with business name and city.',
    },
    {
      before: 'Spent 24 hours sending 10 businesses unfinished mockups.',
      after: 'Spend 2 minutes to run a campaign and 1,000s of businesses receive complete production-grade live sites into their SMS or email.',
    },
    {
      before: 'Closed $200/mo retainer, now spending rest of 24 hours fulfilling their basic needs.',
      after: 'Click one button and generate a QR code of business owner PWA. They will receive their own dashboard where they can edit their site, receive booking notifications, and see client details.',
    },
  ],
};

export const whyUsCopy = {
  eyebrow: 'BUILT FOR AGENCY SCALE',
  heading: 'Built to automate every service your agency sells.',
  sub: 'From instant website rebranding to multi-channel outreach and client mobile dashboards.',
  cells: [
    {
      label: 'Automated Site Rebranding',
      body:
        'Upload or vibe-code 1 master template. Lunao automatically populates local business names, addresses, phone numbers, and niche photos for 1,000s of leads.',
      evidence: 'Rebranding engine · 1-click',
    },
    {
      label: 'Global Edge Deployments',
      body:
        'Every site deploys to global edge servers on its own clean URL with SSL in seconds, ready for mobile viewing.',
      evidence: 'Edge Server · Live',
    },
    {
      label: 'Carrier Delivery Receipts',
      body:
        'Telnyx SMS integration reports real-time delivery status for every text sent during your outreach campaigns.',
      evidence: 'Telnyx carrier webhook',
    },
    {
      label: 'Turnkey Client PWA',
      body:
        'Give business owners their own mobile dashboard to manage bookings, edit text, and view client leads without touching your schedule.',
      evidence: 'Owner PWA · Instant QR',
    },
    {
      label: 'Local Business Discovery',
      body:
        'Search any city and niche to find local businesses needing website upgrades and automated booking systems.',
      evidence: 'Local search engine',
    },
    {
      label: 'Auto-Refund Protection',
      body:
        'If a text bounces or a deployment fails, credits automatically return to your ledger with detailed event logs.',
      evidence: 'Credit ledger · Auditable',
    },
  ],
};

export const howItWorksCopy = {
  eyebrow: 'HOW IT WORKS',
  heading: 'Four steps in under a minute.',
  sub: 'Launch your first campaign and deliver personalized sites in 60 seconds.',
  steps: [
    {
      n: '01',
      title: 'Pick or Vibe-Code a Master Template.',
      body: 'Select from built-in industry templates or vibe-code your own multi-page master design.',
      mockKind: 'search',
    },
    {
      n: '02',
      title: 'Target a Niche & City.',
      body: 'Choose your target city and vertical (Barbers, HVAC, Dentists, Salons, Roofers, Gyms).',
      mockKind: 'results',
    },
    {
      n: '03',
      title: 'Launch 1-Click Outreach.',
      body: 'Lunao rebrands the template for 1,000s of businesses and sends live links via email and SMS.',
      mockKind: 'preview',
    },
    {
      n: '04',
      title: 'Deliver Client PWA.',
      body: 'Share the business owner PWA QR code to give them their own self-serve dashboard.',
      mockKind: 'sms',
    },
  ],
};

export const benefitsCopy = {
  eyebrow: 'WHY AGENCIES CHOOSE LUNAO',
  heading: 'Eight things you get that the rest of the stack does not give you.',
  cells: [
    {
      icon: 'Armchair',
      headline: 'Master Template Rebranding Engine',
      body: 'Vibe-code once, Lunao rebrands for 1,000s of businesses in 1 click.',
    },
    {
      icon: 'Link',
      headline: 'Live Custom Edge URLs',
      body: 'Not screenshots or Figma frames—working sites on live edge servers with SSL.',
    },
    {
      icon: 'Inbox',
      headline: 'Multi-Channel Email & SMS Outreach',
      body: 'Reach business owners directly on their phones with personalized site preview links.',
    },
    {
      icon: 'Coins',
      headline: 'Turnkey Client Owner PWA',
      body: 'Give clients their own mobile portal to edit text, track leads, and manage bookings.',
    },
    {
      icon: 'Receipt',
      headline: 'Telnyx SMS Carrier Receipts',
      body: 'Real-time webhook tracking showing queued, sent, and confirmed delivery states.',
    },
    {
      icon: 'LayoutTemplate',
      headline: 'Google Dork Lead Discovery',
      body: 'Uncover local businesses with outdated websites or missing booking flows in seconds.',
    },
    {
      icon: 'CalendarCheck',
      headline: 'Auditable Credit Ledger',
      body: 'Full visibility on every credit spent, with instant refunds on bounced sends.',
    },
    {
      icon: 'MessageSquare',
      headline: 'Built-in AI & Rules Receptionist',
      body: 'Deploys interactive client response systems so business owners never miss a booking.',
    },
  ],
};

export const pricingCopy = {
  eyebrow: 'PRICING PLANS',
  heading: 'Simple subscription plans. Transparent credit rates.',
  sub: 'Choose the plan tier that fits your agency outreach volume. Upgrade or switch anytime.',
  plans: [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      cadence: '/mo',
      credits: '15 credits (one-time)',
      tagline: 'Trial sandbox for testing the Lunao engine and AI Vibe Coding.',
      features: [
        '15 one-time Lunao Credits',
        '15 free AI Vibe Coding credits (one-time)',
        '1 trial Owner PWA business',
        'Site rebrand & deploy (3 credits)',
        'Find SMS lead (1.5 credits)',
        'SMS outreach: Canada only',
        'Email discovery (1.5 credits/email)',
        'Email sending: 0 credits (Free for all)'
      ],
      cta: 'Start Free (15 Credits + 15 AI)',
      recommended: false,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: '$97',
      cadence: '/mo',
      credits: '2,500 credits / month',
      tagline: 'Best for testing campaigns in local niches & cities.',
      features: [
        '2,500 Lunao Credits / month',
        '600 AI credits allowance',
        'Up to 8 Owner PWA businesses',
        'Site rebrand & deploy (3 credits)',
        'Find SMS lead (1.5 credits)',
        'SMS sending: 0 credits (Worldwide to any country)',
        'Email sending: 0 credits (Free for all)',
        'Email discovery (1.5 credits/email)'
      ],
      cta: 'Select Starter',
      recommended: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$187',
      cadence: '/mo',
      credits: '6,500 credits / month',
      tagline: 'Built for power users & growing agencies.',
      features: [
        '6,500 Lunao Credits / month',
        '1,200 AI credits allowance',
        'Up to 25 Owner PWA businesses',
        'Site rebrand & deploy (3 credits)',
        'Find SMS lead (1.5 credits)',
        'SMS sending: 0 credits (Worldwide to any country)',
        'Email sending: 0 credits (Free for all)',
        'Email discovery (1.5 credits/email)'
      ],
      cta: 'Select Pro',
      recommended: true,
    },
    {
      id: 'agency',
      name: 'Agency',
      price: '$297',
      cadence: '/mo',
      credits: '12,000 credits / month',
      tagline: 'Full high-volume automation suite & white-label PWA.',
      features: [
        '12,000 Lunao Credits / month',
        '1,500 AI credits allowance',
        'Up to 100 Owner PWA businesses',
        'Full AI Vibe Coding Studio access',
        'Multi-client management & custom domain routing',
        'SMS sending: 0 credits (Worldwide to any country)',
        'Email sending: 0 credits (Free for all)',
        'Email discovery (1.5 credits/email)'
      ],
      cta: 'Select Agency',
      recommended: false,
    },
  ],
  creditMathHeading: 'Credit consumption rates.',
  creditMathRows: [
    { action: 'Website rebrand + initial deployment', cost: '3 credits' },
    { action: 'Find one business for SMS campaign', cost: '1.5 credits' },
    { action: 'Email discovery per email found', cost: '1.5 credits' },
    { action: 'SMS (1 segment)', cost: '4 credits' },
    { action: 'SMS (2 segments / additional)', cost: '8 credits' },
    { action: 'SMS using own Telnyx account', cost: '0 credits' },
    { action: 'Failed SMS refund', cost: '1.5 credits refund' },
    { action: 'Failed site deployment refund', cost: '3 credits refund' },
  ],
  rolloverNote: 'Credits debited strictly based on performance actions. 0 credits per SMS with your own Telnyx key.',
};

export const ctvCopy = {
  heading: 'Ready to scale your web & AI agency on autopilot?',
  body: 'Sign up free, get 15 Lunao credits plus 15 free AI vibe-coding credits, and launch your first campaign in under 60 seconds. No credit card required.',
  ctaPrimary: 'Start Free (15 Credits + 15 AI)',
  ctaSecondary: 'Contact Support',
  mailto: 'mailto:support@lunao.app',
};

export const faqCopy = {
  eyebrow: 'FAQ',
  heading: 'The questions agencies ask before signing up.',
  items: [
    {
      q: 'How many credits do new accounts receive?',
      a: 'Free plan accounts start with 15 one-time Lunao Credits to test website rebranding and lead discovery, plus 15 free AI vibe-coding credits (one-time) to try the AI Web Studio with Gemini Flash models.',
    },
    {
      q: 'How much do subscription plans cost?',
      a: 'Starter is $97/mo (2,500 credits, 600 AI credits allowance, 8 Owner PWA businesses). Pro is $187/mo (6,500 credits, 1,200 AI credits allowance, 25 Owner PWA businesses). Agency is $297/mo (12,000 credits, 1,500 AI credits allowance, 100 Owner PWA businesses).',
    },
    {
      q: 'What are the credit rates for campaigns?',
      a: 'Website rebrand & initial deployment costs 3 credits. Finding 1 business for SMS costs 1.5 credits. Email discovery costs 1.5 credits per email. SMS costs 4 credits for 1 segment and 8 credits for 2 segments (or 0 credits if you connect your own Telnyx account).',
    },
    {
      q: 'What happens if a site deployment or SMS send fails?',
      a: 'A failed site deployment refunds 3 credits automatically. A failed SMS send refunds 1.5 credits back to your ledger with an event record.',
    },
    {
      q: 'Can I connect my own Telnyx SMS account?',
      a: 'Yes. Connecting your own Telnyx API credentials allows you to send SMS campaigns for 0 Lunao credits on Starter, Pro, and Agency plans.',
    },
    {
      q: 'What is the Owner Pwa business limit per plan?',
      a: 'Free includes 1 trial business. Starter includes up to 8 Owner PWA businesses. Pro includes up to 25. Agency includes up to 100 Owner PWA businesses.',
    },
    {
      q: 'Can I switch or cancel plans anytime?',
      a: 'Yes. You can upgrade, downgrade, or cancel your subscription at any time with no lock-in periods or cancellation fees.',
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
        { label: 'Value', href: '#use-cases' },
        { label: 'Comparison', href: '#pain' },
      ],
    },
    {
      label: 'Account',
      links: [
        { label: 'Log in', href: '#', auth: 'login' as const },
        { label: 'Sign up', href: '#', auth: 'signup' as const },
        { label: 'Plans', href: '#pricing' },
      ],
    },
    {
      label: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
      ],
    },
  ],
  tagline: 'Built to claim.',
  copyright: '© 2026 Lunao Inc.',
  statusLabel: 'Status: live',
};
