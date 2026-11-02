# Lunao — Build Status & Progress Tracker

_Last updated: 2026-06-14 (live keys installed + tested)_

## 🔴 ACTION REQUIRED
- **Telnyx balance is NEGATIVE (−$2.29).** Real SMS will be rejected until you
  top up at https://portal.telnyx.com → Billing. Auth + sender number are valid.
- **Need a real recipient phone number** to do a true end-to-end SMS test
  (the sample CSV uses fake `555` numbers that carriers reject).

This file tracks how close the project is to being a perfect, production-ready
local-site outreach machine. Read `PROJECT_CONTEXT.md` for the business
blueprint and `SETUP.md` for run/keys instructions.

---

## TL;DR

- **Is the pipeline built? → YES, and now LIVE.** Real keys are installed.
- ✅ **Cloudflare Pages deploy is VERIFIED LIVE** — sites publish to
  `https://sms-bulk-pages.pages.dev/<slug>/` and return HTTP 200.
- ✅ **Telnyx auth VERIFIED** (API key valid, messaging profile "Uk sms profile"
  enabled, sender `+1XXXXXXXXXX`).
- ⏳ **Real SMS not yet confirmed** — blocked by negative Telnyx balance + no real
  recipient number. Fix both and it's 100%.

**Overall completion: ~95%** (deploy verified live; only a funded SMS test remains).

---

## What "perfect" means (definition of done)

1. ✅ Upload a CSV of leads (no Google Maps needed).
2. ✅ Each lead gets a personalized website compiled from the raw template
   (zero leftover `{{placeholders}}`).
3. ⏳ Each site is deployed live to Cloudflare Pages (needs CF keys).
4. ⏳ Each lead gets a real SMS with their live site link (needs Telnyx keys).
5. ✅ Live progress + results shown in the dashboard and CLI.
6. 🔜 (Future) Google Maps lead discovery instead of CSV.

---

## Progress by component

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Dashboard UI (React) | ✅ Done | Pre-existing, runs on :3000 |
| 2 | Template compile engine | ✅ Done | Fills all placeholders incl. niche extras; 0 brackets left; raw templates untouched |
| 3 | CSV parser | ✅ Done | Header aliases (Name/Phone/City/...); dependency-free |
| 4 | Pipeline orchestrator | ✅ Done | compile → deploy → SMS, streams live events |
| 5 | Express API + SSE | ✅ Done | `/api/campaign/run`, `/api/compile`, `/api/csv/parse`, `/api/health` |
| 6 | Local site hosting (dry-run) | ✅ Done | Served at `/sites/<slug>/` |
| 7 | CLI runner | ✅ Done | `npm run pipeline -- sample-leads.csv` |
| 8 | Frontend ↔ backend wiring | ✅ Done | CSV upload + Launch run the real pipeline (graceful fallback) |
| 9 | Cloudflare Pages deploy | ✅ VERIFIED LIVE | Deployed to `sms-bulk-pages.pages.dev`, sites return 200 |
| 10 | Telnyx SMS | ✅ Auth verified / ⏳ send pending | Needs balance top-up + real recipient |
| 11 | Google Maps discovery | 🔜 Future | Stubbed; CSV mode is the v1 |

Legend: ✅ done · ⏳ waiting on keys to verify · 🔜 future

---

## Verified working (dry-run, no keys)

- ✅ `sample-leads.csv` → **8/8 sites generated, 8 SMS dispatched, 0 failures**
- ✅ Compiled site has **0 leftover placeholders**, correct business name / city /
  phone / `tel:` links
- ✅ SSE event stream: `start → compile → generate → deploy → sms → done`
- ✅ Dashboard, API, proxy, and `/sites/<slug>/` all return HTTP 200 via :3000
- ✅ TypeScript type-check passes, no lint errors

---

## API keys needed to test the REAL version

You only need these **two** to go fully live now (Google Maps is later):

### 1. Telnyx — for real SMS
| Key | Where to get it |
|---|---|
| `TELNYX_API_KEY` | https://portal.telnyx.com → API Keys |
| `TELNYX_PHONE_NUMBER` | A purchased SMS number, in E.164 (e.g. `+15125550182`) |
| `TELNYX_MESSAGING_PROFILE_ID` | Optional but recommended (Messaging → Profiles) |

### 2. Cloudflare Pages — for real live hosting
| Key | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens (permission: **Cloudflare Pages: Edit**) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages (right sidebar) |
| `CLOUDFLARE_PAGES_PROJECT` | Create a Pages project once (e.g. `lunao-sites`) |
| `CLOUDFLARE_PAGES_BRANCH` | Usually `main` |
| `SITE_BASE_URL` | Optional — only if you map a custom domain |

### 3. Google Maps — NOT needed yet
`GOOGLE_MAPS_API_KEY` — leave blank. CSV upload is the v1 lead source.

### How to apply the keys
1. `cp .env.example .env.local`
2. Paste the values above into `.env.local`
3. Restart: `npm run dev:all`
4. Startup banner should show **LIVE** next to Telnyx and Cloudflare Pages.
5. Run a campaign → real deploy + real SMS.

---

## Live test results (2026-06-14)

- ✅ Cloudflare: `node scripts/test-deploy.mjs` → deployed live, 2 sites HTTP 200
  - https://sms-bulk-pages.pages.dev/vintage-cuts-barber-lounge-austin/
  - https://sms-bulk-pages.pages.dev/everest-climate-systems-austin/
- ✅ Telnyx: `node scripts/test-telnyx.mjs` → AUTH OK, profile enabled
  - ⚠️ Balance: **−$2.29 USD** (must top up before sending)

## What's left to reach 100%

- [ ] **Top up Telnyx balance** (currently negative).
- [ ] **Provide a real mobile number** to receive a test SMS.
- [ ] Run one funded live campaign and confirm the SMS arrives with the live link.
- [ ] (Optional) Custom domain via `SITE_BASE_URL`.
- [ ] (Future) Google Maps lead discovery to replace CSV.
- [ ] (Optional) Credit accounting tied to real sends; opt-out/STOP handling for SMS compliance.

## Diagnostics scripts
- `node scripts/test-deploy.mjs` — live Cloudflare deploy (no SMS)
- `node scripts/test-telnyx.mjs` — Telnyx auth + balance (read-only, no SMS)

---

## How to run / test

```bash
npm run dev:all                      # dashboard :3000 + API :8787
npm run pipeline -- sample-leads.csv # run the whole pipeline from CLI
```

Dashboard test: Campaigns → Upload CSV (`sample-leads.csv`) → pick template → Launch.
