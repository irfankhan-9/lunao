# God-Level Plan — Remove All Mocked Functionality

_Goal: make the dashboard 100% real (CSV → compile → Cloudflare deploy → credits deducted → campaign + deployed sites visible in dashboard). Real SMS is the ONLY thing kept as "Coming Soon" until Telnyx credits are added tomorrow._

---

## Definition of done — ✅ ALL DONE & VERIFIED

- [x] Upload CSV with **Business Name, City Name, Phone Number** → parsed for real
- [x] Launch a campaign → each lead's site **compiled + deployed live to Cloudflare** (verified: HTTP 200, 0 placeholders, real city)
- [x] **Credits deducted** for real (4/lead), refunded on failed deploys
- [x] **Recent Campaigns** shows the campaign you ran (persists across refresh via localStorage)
- [x] **Deployed Sites** shows the real `sms-bulk-pages.pages.dev/<slug>/` links
- [x] **Real SMS = "Coming Soon"** badge everywhere (no fake "Delivered")
- [x] **No mock data** anywhere (campaigns/businesses/stats/leads start empty)
- [x] Google Maps "Leads Finder" tab = **"Coming Soon"** (CSV is the only live input)

### Verified live test (1 lead → "Lunao Test Cuts", New York, 0304571380)
- Site deployed LIVE: `https://sms-bulk-pages.pages.dev/lunao-test-cuts-new-york/` → HTTP 200
- Business name + city fully rendered, **0 leftover `{{ }}` placeholders**
- SMS dispatched: 0 · SMS coming soon: 1 · Telnyx: `coming_soon` · Cloudflare: `live`

---

## What is currently MOCKED (to be removed/replaced)

| # | Location | Mock | Action |
|---|---|---|---|
| 1 | `src/data.ts` | `initialCampaigns`, `initialBusinesses`, `initialSmsLogs`, `activitiesLog` | Empty them; load real persisted data instead |
| 2 | `Dashboard.tsx` | `totalSites` (+1150), `totalSms` (+3812) fake offsets | Compute from real campaigns (start at 0) |
| 3 | `Dashboard.tsx` | Site link shows hardcoded `{slug}.lunao.io` | Show real `biz.siteUrl` (Cloudflare) |
| 4 | `Campaigns.tsx` | `generateMockGoogleLeads`, default `inputMethod='find'` | Default to `csv`; gate `find` as "Coming Soon" |
| 5 | `Campaigns.tsx` | `handleLaunchCampaign` setTimeout simulation | Use real backend pipeline only (CSV path) |
| 6 | `Campaigns.tsx` | Credit deduction inside the fake timeline | Deduct from **real** pipeline results |
| 7 | Backend `pipeline/telnyx` | SMS attempts to send | Add `SMS_ENABLED=false` → status `coming_soon`, no send |
| 8 | `Messages.tsx` | SMS logs show fake "Delivered/Clicked/Replied" | Show real deploy + "SMS Coming Soon" |
| 9 | App state | campaigns/businesses reset on refresh | Persist to `localStorage` |

---

## Execution steps

### Phase 1 — Backend: SMS "Coming Soon" switch
- Add `SMS_ENABLED` to `config.js` (default `false`). Tomorrow set `true` in `.env.local`.
- In `pipeline.js`: when `SMS_ENABLED` is false, skip Telnyx entirely and mark each
  result `smsStatus: 'coming_soon'`. Deployment still runs for real.
- `/api/health` reports `sms: 'coming-soon'` vs `'live'`.

### Phase 2 — Backend: credits truth
- Pipeline already returns `results[]` with `siteStatus: 'generated'` + real `siteUrl`.
- Frontend deducts **1 credit per successfully deployed site** now.
  (The 3 SMS credits/lead are reserved and will be charged once SMS goes live.)

### Phase 3 — Frontend: kill the mocks
- `data.ts`: export empty arrays for campaigns/businesses/smsLogs.
- `App.tsx`: hydrate campaigns/businesses/smsLogs from `localStorage`; persist on change.
- `Campaigns.tsx`:
  - default `inputMethod = 'csv'`.
  - "Find with Google Maps" tab → disabled + "Coming Soon" badge.
  - launch button always runs `runRealCsvPipeline` (CSV-only).
  - credits deducted from real results; campaign + businesses written from real results.
  - CSV helper text → "Business Name, City, Phone".
- `Dashboard.tsx`: real `totalSites`/`totalSms` (0-based); deployed sites use real `siteUrl`.
- `Messages.tsx`: replace fake statuses with deploy info + "SMS Coming Soon" pill.

### Phase 4 — Verify
- Empty state on fresh load (no fake rows).
- Upload `sample-leads.csv` → launch → real sites deploy → credits drop → campaign shows
  in Recent Campaigns → deployed sites list shows live Cloudflare links → SMS = Coming Soon.

---

## Credit model — DECIDED: full 4 credits/lead now

| Action | Cost | Notes |
|---|---|---|
| Per successfully deployed lead | **4 credits** | 1 (site+CDN) + 3 (SMS, reserved while Coming Soon) |

Refund guarantee: if a site **fails to deploy**, that lead is **not** charged.
SMS is queued as "Coming Soon" but the 4 credits are still deducted now.

---

## Tomorrow (when Telnyx funded)
1. Top up Telnyx balance.
2. Set `SMS_ENABLED="true"` in `.env.local`, restart.
3. SMS sends for real with the live Cloudflare link; SMS credits begin charging.
4. Nothing else changes — the pipeline is already wired.
