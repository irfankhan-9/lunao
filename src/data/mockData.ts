import { Campaign, Business, SmsLog, Template } from '../types';

export const mockCampaigns: Campaign[] = [
  {
    id: 'camp-dork-austin-barbers',
    serverCampaignId: 'srv-camp-101',
    name: 'Austin Premier Barbers (Google Dork)',
    niche: 'Barber',
    type: 'email',
    status: 'Completed',
    templateId: 'barber-dark-luxury',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    leadsFound: 28,
    sitesGenerated: 24,
    emailsSent: 22,
    emailsFailed: 2,
    claimed: 4,
    sites: 24,
    smsSent: 0,
    emailSubject: 'Quick question about {{BUSINESS_NAME}}\'s online booking',
    emailBody: 'Hi team, I noticed your site was missing instant mobile booking. We built a high-converting demo for {{BUSINESS_NAME}} in {{CITY}}: {{SITE_URL}}',
    emailAccountsUsed: [
      { accountId: 'acc-1', accountEmail: 'alex.growth@lunao.io', sent: 12, failed: 1 },
      { accountId: 'acc-2', accountEmail: 'outreach@lunao.agency', sent: 10, failed: 1 }
    ],
    emailLeads: [
      {
        leadId: 'lead-1',
        name: 'Vintage Cuts Barber Lounge',
        email: 'contact@vintagecuts-austin.com',
        accountEmail: 'alex.growth@lunao.io',
        siteUrl: 'https://vintage-cuts.lunao.app',
        status: 'sent',
        discoverySource: 'dork_google',
        city: 'Austin, TX'
      },
      {
        leadId: 'lead-2',
        name: 'South Congress Barbershop',
        email: 'info@soco-barbers.com',
        accountEmail: 'alex.growth@lunao.io',
        siteUrl: 'https://soco-barbers.lunao.app',
        status: 'sent',
        discoverySource: 'dork_google',
        city: 'Austin, TX'
      },
      {
        leadId: 'lead-3',
        name: 'Capital City Grooming',
        email: 'booking@capitalgrooming.com',
        accountEmail: 'outreach@lunao.agency',
        siteUrl: 'https://capital-grooming.lunao.app',
        status: 'sent',
        discoverySource: 'dork_google',
        city: 'Austin, TX'
      },
      {
        leadId: 'lead-4',
        name: 'Red River Blade & Beard',
        email: 'owner@redriverblade.com',
        accountEmail: 'outreach@lunao.agency',
        siteUrl: 'https://redriver-blade.lunao.app',
        status: 'failed',
        reason: 'Mailbox full / soft bounce',
        discoverySource: 'dork_google',
        city: 'Austin, TX'
      }
    ],
    deployedSites: [
      {
        slug: 'vintage-cuts-barber-lounge',
        name: 'Vintage Cuts Barber Lounge',
        city: 'Austin, TX',
        url: 'https://vintage-cuts.lunao.app',
        status: 'live'
      },
      {
        slug: 'south-congress-barbershop',
        name: 'South Congress Barbershop',
        city: 'Austin, TX',
        url: 'https://soco-barbers.lunao.app',
        status: 'live'
      }
    ]
  },
  {
    id: 'camp-deploy-dallas-dentists',
    serverCampaignId: 'srv-camp-102',
    name: 'Dallas Cosmetic Dental Outreach',
    niche: 'Dentist',
    type: 'site-deploy',
    status: 'Completed',
    templateId: 'dentist-clarity',
    createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
    leadsFound: 18,
    sitesGenerated: 18,
    emailsSent: 0,
    smsSent: 0,
    claimed: 3,
    sites: 18,
    deployedSites: [
      {
        slug: 'radiant-smiles-dallas',
        name: 'Radiant Smiles Family Dentistry',
        city: 'Dallas, TX',
        url: 'https://radiant-smiles.lunao.app',
        status: 'live'
      },
      {
        slug: 'uptown-aesthetic-dental',
        name: 'Uptown Aesthetic Dental',
        city: 'Dallas, TX',
        url: 'https://uptown-dental.lunao.app',
        status: 'live'
      },
      {
        slug: 'oak-lawn-implant-center',
        name: 'Oak Lawn Implant Center',
        city: 'Dallas, TX',
        url: 'https://oak-lawn-implants.lunao.app',
        status: 'live'
      }
    ]
  },
  {
    id: 'camp-hvac-miami-emergency',
    serverCampaignId: 'srv-camp-103',
    name: 'Miami Emergency HVAC Pipeline',
    niche: 'HVAC',
    type: 'email',
    status: 'Active',
    templateId: 'hvac-everest',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    leadsFound: 35,
    sitesGenerated: 32,
    emailsSent: 19,
    emailsFailed: 1,
    claimed: 2,
    sites: 32,
    smsSent: 0,
    emailSubject: 'Emergency cooling website upgrade for {{BUSINESS_NAME}}',
    emailBody: 'Hi {{BUSINESS_NAME}} team, we set up a ready-to-launch 24/7 emergency dispatch landing page for you: {{SITE_URL}}',
    emailAccountsUsed: [
      { accountId: 'acc-1', accountEmail: 'alex.growth@lunao.io', sent: 19, failed: 1 }
    ],
    emailLeads: [
      {
        leadId: 'lead-h1',
        name: 'Everest Climate Systems',
        email: 'dispatch@everestclimate.com',
        accountEmail: 'alex.growth@lunao.io',
        siteUrl: 'https://everest-climate.lunao.app',
        status: 'sent',
        discoverySource: 'dork_google_nearby',
        city: 'Miami, FL'
      },
      {
        leadId: 'lead-h2',
        name: 'Biscayne Air & Heat Masters',
        email: 'service@biscayneair.com',
        accountEmail: 'alex.growth@lunao.io',
        siteUrl: 'https://biscayne-air.lunao.app',
        status: 'sent',
        discoverySource: 'dork_google_nearby',
        city: 'Miami, FL'
      }
    ]
  },
  {
    id: 'camp-sms-chicago-gyms',
    serverCampaignId: 'srv-camp-104',
    name: 'Chicago Elite Fitness SMS Flash',
    niche: 'Gym',
    type: 'sms',
    status: 'Completed',
    templateId: 'gym-iron',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    leadsFound: 15,
    sitesGenerated: 12,
    emailsSent: 0,
    smsSent: 12,
    claimed: 2,
    sites: 12,
    smsLeads: [
      {
        leadId: 'lead-sms-1',
        name: 'Iron & Grit Crossfit',
        phone: '(312) 555-0744',
        siteUrl: 'https://iron-grit.lunao.app',
        status: 'delivered',
        city: 'Chicago, IL'
      },
      {
        leadId: 'lead-sms-2',
        name: 'Windy City Barbell Club',
        phone: '(312) 555-0812',
        siteUrl: 'https://windy-city-barbell.lunao.app',
        status: 'delivered',
        city: 'Chicago, IL'
      }
    ],
    deployedSites: [
      {
        slug: 'iron-grit-crossfit',
        name: 'Iron & Grit Crossfit',
        city: 'Chicago, IL',
        url: 'https://iron-grit.lunao.app',
        status: 'live'
      },
      {
        slug: 'windy-city-barbell',
        name: 'Windy City Barbell Club',
        city: 'Chicago, IL',
        url: 'https://windy-city-barbell.lunao.app',
        status: 'live'
      }
    ]
  }
];

export const mockBusinesses: Business[] = [
  {
    id: 'biz-vintage-cuts',
    name: 'Vintage Cuts Barber Lounge',
    owner: 'Marco Rossi',
    phone: '(512) 555-0199',
    city: 'Austin, TX',
    niche: 'Barber',
    webStatus: 'Has website',
    siteStatus: 'Converted',
    slug: 'vintage-cuts-barber-lounge',
    siteUrl: 'https://vintage-cuts.lunao.app',
    smsHistory: [
      {
        text: 'Hi Marco, we built a custom booking experience for Vintage Cuts: https://vintage-cuts.lunao.app',
        timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
        type: 'outgoing',
        deliveryStatus: 'delivered'
      },
      {
        text: 'Wow, this looks incredible! How do we connect our Square calendar?',
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        type: 'incoming'
      }
    ]
  },
  {
    id: 'biz-radiant-smiles',
    name: 'Radiant Smiles Family Dentistry',
    owner: 'Dr. Alex Rivera',
    phone: '(214) 555-0248',
    city: 'Dallas, TX',
    niche: 'Dentist',
    webStatus: 'Has website',
    siteStatus: 'Site generated',
    slug: 'radiant-smiles-dallas',
    siteUrl: 'https://radiant-smiles.lunao.app',
    smsHistory: []
  },
  {
    id: 'biz-everest-climate',
    name: 'Everest Climate Systems',
    owner: 'James Henderson',
    phone: '(305) 555-0988',
    city: 'Miami, FL',
    niche: 'HVAC',
    webStatus: 'Has website',
    siteStatus: 'SMS sent',
    slug: 'everest-climate-miami',
    siteUrl: 'https://everest-climate.lunao.app',
    smsHistory: [
      {
        text: 'James, your new 24/7 HVAC Emergency dispatch page is live: https://everest-climate.lunao.app',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        type: 'outgoing',
        deliveryStatus: 'delivered'
      }
    ]
  }
];

export const mockSmsLogs: SmsLog[] = [
  {
    id: 'sms-log-1',
    businessName: 'Vintage Cuts Barber Lounge',
    phone: '(512) 555-0199',
    sentAt: '2 hours ago',
    status: 'Clicked',
    previewLink: 'https://vintage-cuts.lunao.app'
  },
  {
    id: 'sms-log-2',
    businessName: 'Everest Climate Systems',
    phone: '(305) 555-0988',
    sentAt: '4 hours ago',
    status: 'Delivered',
    previewLink: 'https://everest-climate.lunao.app'
  },
  {
    id: 'sms-log-3',
    businessName: 'Iron & Grit Crossfit',
    phone: '(312) 555-0744',
    sentAt: 'Yesterday',
    status: 'Replied',
    previewLink: 'https://iron-grit.lunao.app'
  }
];

export const mockActivitiesLog = [
  {
    text: 'Google Dork discovered 28 target barbers in Austin, TX',
    time: '2 hours ago',
    type: 'dork'
  },
  {
    text: 'Deployed high-converting website for Vintage Cuts Barber Lounge',
    time: '3 hours ago',
    type: 'deploy'
  },
  {
    text: 'Marco Rossi opened demo site and requested Owner PWA access',
    time: '4 hours ago',
    type: 'pwa'
  },
  {
    text: 'Automated email sequence delivered 19 messages for Miami HVAC',
    time: '5 hours ago',
    type: 'email'
  }
];
