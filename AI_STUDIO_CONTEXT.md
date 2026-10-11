# 📚 Lunao AI Studio Technical Context & Architecture Map

Upload or reference this file when collaborating with coding models in Google AI Studio. It gives the AI full structural context of the codebase without needing to read every file.

---

## 🗂️ 1. Directory Blueprint

```
lunao-master/
├── public/                     # Static previews served directly in iframes
│   ├── templates-raw/          # [SACRED] Master templates with {{PLACEHOLDERS}}
│   │   ├── barber-template.html
│   │   ├── barber-template-02.html
│   │   ├── salon-template-01.html
│   │   ├── dentist-template-01.html
│   │   ├── hvac-template-01.html
│   │   ├── gym-template-01.html
│   │   ├── realestate-template-01.html
│   │   └── roofing-template-01.html
│   └── *.html                  # Compiled pre-rendered templates with realistic dummy data
│
├── lunaoownerpwa/              # Standalone Client Mobile PWA (React 19 + Vite)
│   ├── src/pages/              # DashboardPage, BookingsPage, AIReceptionistPage, ChatInboxPage
│   ├── src/components/         # AppShell, MobileNav, BottomSheet, PWAInstallBanner
│   └── src/services/mockData.ts# Standalone mock data service
│
├── src/                        # Main Agency Dashboard & Vibe Studio
│   ├── App.tsx                 # Root application controller & tab navigation
│   ├── types.ts                # Master TypeScript interface contracts
│   ├── data.ts                 # Template manifests, niches & standalone mock loader
│   ├── data/mockData.ts        # Rich mock campaigns, businesses, and activity logs
│   ├── contexts/GateContext.tsx# Security wall (automatically bypasses in mock mode)
│   ├── utils/audio.ts          # Tactile audio feedback (playSoftTap, playTiktokLike, etc.)
│   └── components/
│       ├── TemplateLabPage.tsx # The Template Vibe Coder / AI Generator
│       ├── Templates.tsx       # Template catalog and live preview launcher
│       ├── TemplatePreviewModal.tsx # Multi-device iframe previewer
│       ├── Campaigns.tsx       # Outreach wizard and progress monitors
│       ├── Dashboard.tsx       # Main agency conversion analytics & KPIs
│       ├── OwnerPWADrawer.tsx  # Deep link generator into the client PWA
│       └── Editor.tsx          # Real-time visual template site customizer
│
└── server/ & scripts/          # Backend engine (kept separate on backend-engine branch)
```

---

## 💎 2. Supported Template Placeholders

When vibe-coding new template layouts or personalizing existing templates, only use these canonical placeholders:

| Placeholder | Meaning | Realistic Sample |
|---|---|---|
| `{{BUSINESS_NAME}}` | Full legal business name | Vintage Cuts Barber Lounge |
| `{{BUSINESS_NAME_SHORT}}` | Single-word brand name for badges | Vintage Cuts |
| `{{CITY}}` | City location | Austin, TX |
| `{{STATE}}` | State code | TX |
| `{{PHONE_DISPLAY}}` | Formatted phone number | (512) 555-0199 |
| `{{PHONE_RAW}}` | Digits only for `tel:` link | 5125550199 |
| `{{EMAIL}}` | Contact email | contact@vintagecuts.com |
| `{{ADDRESS}}` | Local address | 3801 Capital of Texas Hwy |
| `{{GOOGLE_RATING}}` | Rating score | 4.9 |
| `{{GOOGLE_REVIEW_COUNT}}` | Number of reviews | 342 |
| `{{INSTAGRAM_HANDLE}}` | Instagram handle without @ | vintagecuts_atx |
| `{{SITE_URL}}` | Generated preview URL | https://vintage-cuts.lunao.app |

---

## 📊 3. Key TypeScript Models (`src/types.ts`)

```typescript
export interface Campaign {
  id: string;
  name: string;
  niche: string;
  type?: 'email' | 'site-deploy' | 'sms';
  status: 'Active' | 'Completed' | 'Queued' | 'Crashed';
  templateId: string;
  createdAt: string;
  leadsFound?: number;
  sitesGenerated?: number;
  emailsSent?: number;
  emailsFailed?: number;
  claimed: number;
  deployedSites?: CampaignDeployedSite[];
  emailLeads?: CampaignEmailLead[];
}

export interface Business {
  id: string;
  name: string;
  owner: string;
  phone: string;
  city: string;
  niche: string;
  webStatus: 'No website' | 'Has website';
  siteStatus: 'Site generated' | 'SMS sent' | 'Converted' | 'Not started';
  slug: string;
  siteUrl: string;
}
```

---

## 🎨 4. Design Guidelines

1. **Colors**:
   - Backgrounds: Dark slate/black (`#0a0b0e`, `#12141a`, `bg-neutral-900`)
   - Surface cards: `bg-white/[0.04]` or `bg-neutral-900/60` with `backdrop-blur-md`
   - Accents: Vibrant gold/amber (`#D97706`, `#F59E0B`, `text-amber-400`)
   - Borders: Subtle `border-white/10` or `border-neutral-800`
2. **Typography**: Inter / system sans-serif for clean UI, Playfair Display / serif for luxury editorial accents.
3. **Sound**: Trigger `playSoftTap()` on tabs, `playTiktokLike()` on buttons, and `playVictoryCelebration()` on success.
