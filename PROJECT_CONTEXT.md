# Lunao Project Context & Technical Blueprint

This document serves as the master blueprint and reference manual for Lunao's software developers and future coding agents. Always read and integrate the rules and flow diagrams outlined here before making any modifications to the codebase.

---

## 1. Project Overview & Business Model

**Lunao** is an elite, high-fidelity SaaS dashboard designed for local digital marketing agencies and B2B software sales. It automates local client acquisition by combining three core features into a unified pipeline: **high-intent lead generation** via Google Maps Places indexing, **automated instant high-precision website generation**, and **direct localized SMS outreach sequences**.

### Subscription & Credit Mechanics
To maintain high performance and prevent abuse, all user actions operate on a state-aware, real-time credit-deduction economy:
*   **Google Maps Search Scan Cost**: Scanning or running an active crawl on Google Maps targeting a local niche costs **1 credit per 3 discovered listings** (e.g., crawling 15 prospects deducts 5 credits). This reflects real-time Maps API resource allocation.
*   **Outreach & Custom Site Deployment Cost**: Outreaching to and selecting a lead costs **4 credits per unique business profile**.
    *   **3 Credits** are allocated to SMS delivery and Twilio telecommunication routing.
    *   **1 Credit** is allocated to custom personalized domain routing, high-fidelity template compilation, and live hosting.
*   **Action Guards**: Strict state-level budget guards exist on the front-end and back-end to block users and gracefully display detailed warnings if they attempt search crawls or lead selections exceeding their active credit balances.

---

## 2. Technical Knowledge & Core Safeguards

### 🚨 Critical Guideline: Pristine Templates vs. Live Previews

To preserve the SaaS intellectual property, professional aesthetic, and maintain a high-quality user experience:

1.  **Strict Isolation of Master Templates (`/public/templates-raw/`)**:
    *   All pristine HTML master templates containing raw `{{PLACEHOLDERS}}` (e.g., `{{BUSINESS_NAME}}`, `{{CITY}}`) **MUST REMAIN 100% RAW AND UNTOUCHED** in the `/public/templates-raw/` directory.
    *   Never overwrite, delete, or clean up files inside this folder.
2.  **Live Showcase Previews (Pre-Populated Baseline Files)**:
    *   The static HTML files served as instant previews for unpersonalized templates (located in `/public/filename.html` and mirrored as `/filename.html` at the workspace root) **MUST NEVER SHOW HOLES OR RAW BRACKETS** like `{{BUSINESS_NAME}}`.
    *   They are precompiled with premium, highly realistic demo data (e.g., `"Vintage Cuts Barber Lounge"` based in `"Austin, TX"` with realistic review counts) so that browsing clients experience a fully completed premium website mockup.
3.  **Active Personalization Routine**:
    Whenever a business is processed for personalization during a campaign sequence:
    *   **Step 1**: The back-end/personalization engine reads the raw master template directly from `/public/templates-raw/filename.html`.
    *   **Step 2**: The process executes a full replace mapping keys in the template placeholder manifest to verified client details, destroying all brackets.
    *   **Step 3**: The output is compiled and saved to its live destination (e.g., `/public/filename.html` and its root mirror `/filename.html`, ensuring perfect synchronization).
    *   **Validation**: 0 instances of `{{` or `}}` are allowed in compiled outputs.

---

## 3. Supported Placeholder Manifest

All raw templates leverage standard structured tokens mapped directly to business coordinates extracted during Google Maps indexing:

| Placeholder | Context / Description | Example Value |
|---|---|---|
| `{{BUSINESS_NAME}}` | Full legal or public name of the target business | Everest Climate Systems |
| `{{BUSINESS_NAME_SHORT}}` | Single brand word or compact trademark for small badges | Everest |
| `{{CITY}}` | City location of target focus | Austin |
| `{{STATE}}` | Region state short code | TX |
| `{{YEARS_IN_BUSINESS}}` | Numeric years in commercial operations | 2012 |
| `{{PHONE_DISPLAY}}` | Standard human-readable telephone format | (512) 555-0988 |
| `{{PHONE_RAW}}` | Pure numeric string for standard `tel:` click href targets | 5125550988 |
| `{{EMAIL}}` | Dedicated service mailbox or contact support mail | service@everestclimate.com |
| `{{ADDRESS}}` | Accurate local street physical business address | 3801 Capital of Texas Hwy |
| `{{GOOGLE_RATING}}` | Top-rated reviews scale decimal | 4.9 |
| `{{GOOGLE_REVIEW_COUNT}}` | Target review volume of local listing | 342 |
| `{{SITE_URL}}` | Deployed site URL for link CTAs | https://example.com |
| `{{INSTAGRAM_HANDLE}}` | Handle without @ for social icons | everest_cooling |
| `{{FACEBOOK_URL}}` | Complete profile link for social routing | https://facebook.com/everestcooling |

> **Template Lab (AI-generated templates):** AI-generated custom templates use a **"3 by default"** rule. Only `{{BUSINESS_NAME}}`, `{{CITY}}`, `{{PHONE_DISPLAY}}`, `{{PHONE_RAW}}` are available without extra configuration. Additional placeholders are auto-unlocked based on keywords in the user's prompt. Hardcoded brand names in generated HTML are rejected. See §14 for the full system.

---

## 4. The Complete End-to-End Campaign Outreach Pipeline

To ensure campaign sequences execute flawlessly with high delivery rates, follow this multi-step behavioral lifecycle:

### Step 1: Lead Crawling (Targeting)
*   The dashboard allows the user to specify a commercial Niche (e.g., Barber, Dentist, HVAC, Salon) and a target geographical location.
*   Upon execution, the search button verifies the credit payload ($Credits \ge \lceil Leads \rceil / 3$), deducts the Maps crawl cost, triggers simulated status logs to indicate real-time index querying across Google's Places database, and returns high-intent local listings lacking optimal digital positioning.

### Step 2: Pitch & Campaign Configuration
*   The user selects the corresponding niche template.
*   They draft custom pitch copy containing campaign tracking and localized reference hooks (e.g., "Hey, noticed your site isn't fully optimized for mobile searches in {{CITY}}. We built this design for {{BUSINESS_NAME}}...").

### Step 3: Single-Pass Sequence Execution (Iterative Automation)
When the campaign starts, the automation iterates through the selected business list **one-by-one** to execute the pipeline:

```
[Selected Business Array]
         │
         ├──► [Active Block: Target Business 1]
         │        │
         │        ├── (A) Read Raw Template:
         │        │       Fetches "/public/templates-raw/{niche}-template.html"
         │        │
         │        ├── (B) Replace Placeholders:
         │        │       Compiles personal HTML using extracted business coordinates,
         │        │       fully replacing "{{BUSINESS_NAME}}", "{{CITY}}", etc.
         │        │
         │        ├── (C) Deploy/Publish:
         │        │       Saves compiled index securely inside public deployment path.
         │        │       Under cloud production, builds automated deployment on
         │        │       Cloudflare Pages or static fast-edge CDN bucket.
         │        │
         │        ├── (D) Draft Link & Copy:
         │        │       Constructs unique live draft preview link.
         │        │
         │        └── (E) Dispatch Outreach SMS:
         │                Triggers Twilio API to dispatch localized SMS text.
         │
         ├──► [Active Block: Target Business 2]
         │        │
         │        └── (Repeat complete safe isolated cycle)
         v
```

### Production Edge Deployments (Future Implementation)
*   **Automation Strategy**: When scaled to live production, compiled personalized static site outputs will be shipped automatically to **Cloudflare Pages** utilizing the Cloudflare Pages Pages Project API or custom GitHub actions. This offers instant SSL generation, near-zero deployment times, and massive global edge speed to ensure local business owners experience unmatched page load speeds on their mobile devices upon tapping the outreach link.

---

## 5. What Lunao Is Today (Current State)

Lunao now has two fully functional products, and the outreach pipeline is **100% live with real Telnyx SMS**:

### 5.1 Backend (Express + SQLite → Postgres on Railway)
The Express server at `http://localhost:8787` (configurable `PORT`) is the single API hub. It:
- **Site gate (`server/lib/siteGate.js`)**: a hardcoded password
  (`$Khan1234455`, bcrypt-hashed) gates every dashboard API + page via a
  signed 12h cookie. `GET /api/site-gate/status` lets the SPA check
  auth state without leaking the password.
- Serves and compiles personalized HTML sites from the 8 niche master templates.
- Deploys compiled sites to Cloudflare Pages (live; verified URL prefix `https://*.sms-bulk-pages.pages.dev`).
- Stores **bookings** (`POST /api/bookings`, `PATCH /api/bookings/:id`) and **chatbot conversations** (SQLite tables `chat_sessions` + `chat_messages`).
- Runs a chatbot turn endpoint (`POST /api/chat`) used by the live site widget — uses Gemini 2.5 Flash Lite when `GEMINI_API_KEY` is set, else a rule-based fallback.
- Exposes site add-on toggles (booking + chatbot) per `slug`.
- **Owns the credit economy**: `credit_accounts` + `credit_ledger` tables. `GET /api/credits`, `POST /api/credits/topup`, `GET /api/credits/ledger` are the source of truth. Charges are atomic; refunds are idempotent.
- **Owns campaign history**: `campaigns` + `campaign_leads` + `sms_logs` + `sms_inbound` tables. Every site-gen, every SMS attempt, every Telnyx id, and every delivery receipt is persisted.
- **Enforces credits server-side**: a 402 with `{ needed, available }` is returned (clean JSON, not SSE) before any campaign row is created when the user is broke.
- **Sends real SMS** via Telnyx when `SMS_ENABLED=true` (current state). `server/lib/telnyx.js` does the raw HTTPS POST to `https://api.telnyx.com/v2/messages` with Bearer auth + a messaging profile id, exponential-backoff retry on transient errors, and skips retry on permanent Telnyx codes (invalid number, opt-out, etc.).
- **Receives Telnyx webhooks** at `POST /api/webhooks/telnyx` for inbound SMS replies (`YES` → future publish flow) and delivery receipts that auto-upgrade `sms_status` from `sent` → `delivered`.
- **Refunds SMS failures automatically**: when a send returns a non-recoverable Telnyx error, the 3 SMS credits for that lead are returned to the account and the ledger row `sms_failed_refund` is written.
- **Per-lead site-gen refunds**: if compile + stage fails for a lead, the 1 site-gen credit is refunded (`site_failed_refund`).

### 5.2 Owner App (Expo / React Native — ~95% Complete)
The Owner App is a premium mobile companion for the local business owner whose site Lunao built. It lives in a separate folder (`lunaoexpoapp/`) and is built with:
- **Expo SDK 54**, **React Native 0.81**, **React 19**, **TypeScript**
- Navigation: `expo-router` (file-based)
- Data: `@tanstack/react-query`
- Storage: `expo-secure-store` (token), `AsyncStorage` (settings)
- Notifications: `expo-notifications`
- Audio: `expo-audio`
- Haptics: `expo-haptics`
- Animation: `react-native-reanimated`
- Fonts: `expo-font` + Google Fonts (Playfair Display, Fraunces, Plus Jakarta Sans, Manrope, Inter)
- WebView: `react-native-webview` for live-site preview in the Editor
- Image picker: `expo-image-picker` for image swaps

**All 8 screens are built and wired up:**
- Login (invite code `LUNAO-XXXX-XXXX`)
- Home dashboard (stats, recent activity)
- Bookings list + detail (confirm/cancel, call/text)
- Conversations list + transcript (graceful empty state)
- Editor (WebView live preview, tap to edit images/text, Save + Deploy)
- Settings (profile, notifications, sound, theme, sign out)

Theming is dynamic per niche (8 brand palettes). Sound + haptics on every action. React Query for caching. Push notifications registered. All graceful degradation in place.

### 5.3 Agency Dashboard (Vite + React)
- CSV-only lead ingestion (Google Maps indexer is a `COMING SOON` mock until the Maps key lands).
- Wizard: 1) Niche + template, 2) CSV upload + per-row validation, 3) Custom SMS copy with `{{business_name}}` / `{{city}}` / `{{site_url}}` tokens, 4) Review + launch.
- On launch: client-side optimistic debit of `totalLeads × 4` credits; SSE stream of real server progress (`site:compiling`, `site:generated`, `deploy:done`, `sms:sent`, `sms:failed`, `done`); automatic post-run pull of the authoritative credit balance from `/api/credits` so the dashboard never drifts from the ledger.
- Settings panel shows **server-authoritative** SMS pipeline status (`LIVE` / `DRY-RUN` / `COMING SOON`) pulled from `/api/sms/status` (not editable by the client), plus a **Send Test SMS** button that calls `POST /api/test-sms` and records the attempt in `sms_logs`.

---

## 6. Backend: Endpoints Status

### 6.1 EXISTS TODAY ✅
Verified in `server/index.js`. All JSON with `{ ok, ... }` envelope (except `/api/campaign/run` and `/api/ai/edit` which stream SSE).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Integration mode check |
| GET | `/api/sites` | List deployed sites (slug, title, niche, url, aiEnabled) |
| GET | `/api/sites/:slug` | Current live HTML |
| PUT | `/api/sites/:slug` | Save edits locally (no deploy). Body: `{ html }` |
| POST | `/api/sites/:slug/deploy` | Save + redeploy to Cloudflare Pages. Body: `{ html? }` |
| GET | `/api/sites/:slug/addons` | Booking/chatbot toggle state |
| POST | `/api/sites/:slug/addons` | Set toggles. Body: `{ booking, chatbot }` |
| GET | `/api/sites/:slug/conversations` | Chat sessions list |
| GET | `/api/chat/sessions/:id` | Full chat transcript |
| GET | `/api/sites/:slug/invite-codes` | List invite codes for a site |
| POST | `/api/sites/:slug/invite-codes` | Mint new invite code |
| PATCH | `/api/invite-codes/:id` | Revoke / rename |
| GET | `/api/invite-codes/:code` | Public-safe code lookup |
| GET | `/api/bookings?slug=` | Bookings list (newest first) |
| POST | `/api/bookings` | Create a booking (used by site widgets) |
| PATCH | `/api/bookings/:id` | Update status. Body: `{ status }` |
| POST | `/api/ai/edit` | AI HTML edit (SSE stream). Body: `{ html, instruction, history }` |
| POST | `/api/chat` | One chatbot turn. Body: `{ slug, sessionId?, message, businessName?, services? }` |
| **GET** | **`/api/credits`** | **Server-side balance. Query: `?ownerKey=&plan?`. Returns `{ account, plans, costPerLead }`. Auto-creates + tops up on first sight.** |
| **POST** | **`/api/credits/topup`** | **Force plan top-up. Body: `{ ownerKey, plan }`. Idempotent.** |
| **GET** | **`/api/credits/ledger`** | **Per-user credit ledger rows. Query: `?ownerKey=&limit=50`.** |
| **GET** | **`/api/sms/status`** | **Server-authoritative SMS status (`{ enabled, live, from, hasMessagingProfile }`).** |
| **POST** | **`/api/test-sms`** | **Send a single test SMS. Body: `{ to, text?, ownerKey? }`. Returns real Telnyx id or simulated marker. Records in `sms_logs`.** |
| **GET** | **`/api/campaigns`** | **List campaigns for an owner. Query: `?ownerKey=&limit=50`.** |
| **GET** | **`/api/campaigns/:id`** | **Full campaign + leads + sms_logs.** |
| **POST** | **`/api/campaigns/:id/refund`** | **Admin: refund any failed SMS / failed site-gen credits. Idempotent.** |
| **GET** | **`/api/owner/sms`** | **Per-owner SMS send log. Query: `?ownerKey=&limit=100`.** |
| **POST** | **`/api/webhooks/telnyx`** | **Telnyx webhook. Accepts `message.received` (inbound) + `message.delivered`/`message.failed`/`message.sent` (delivery). Updates `sms_logs.status` and `campaign_leads.sms_status`. Always 200 to avoid retry storms.** |
| **GET** | **`/api/template-categories`** | **List user's custom template categories (with template counts).** |
| **POST** | **`/api/template-categories`** | **Create a new template category. Body: `{ name, color?, icon? }`.** |
| **PUT** | **`/api/template-categories/:id`** | **Update a category (name, color, icon, sortOrder).** |
| **DELETE** | **`/api/template-categories/:id`** | **Delete category; templates move to uncategorized.** |
| **GET** | **`/api/custom-templates`** | **List user's custom templates. Query: `?categoryId=` (optional).** |
| **GET** | **`/api/custom-templates/:id/preview`** | **Return iframe-safe preview HTML (pre-filled with demo data).** |
| **POST** | **`/api/custom-templates/generate`** | **Generate a new template via AI. Body: `{ prompt, niche, categoryId?, name? }`. Costs 2 credits. Returns `{ template }`.** |
| **PUT** | **`/api/custom-templates/:id`** | **Update template metadata (name, category, styleTags).** |
| **DELETE** | **`/api/custom-templates/:id`** | **Delete a custom template.** |

### 6.2 MUST BE ADDED ⚠️ (Frozen Contract — App Codes Against These)
These endpoints are documented in `expo-app-spec/CONTEXT.md` §6 and coded into the Owner App. The app degrades gracefully until they exist. Implementing them is the next backend milestone.

| Method | Path | Purpose | App Behavior If Missing |
|--------|------|---------|------------------------|
| POST | `/api/owner/redeem` | Login with invite code. Body: `{ code }` → `{ token, slug, businessName, niche, siteUrl }` | App uses **dev mode** — stubs a profile from the first live site |
| GET | `/api/owner/me` | Refresh owner profile (Bearer) → same profile | App uses cached profile from SecureStore |
| POST | `/api/owner/push-token` | Register Expo push token. Body: `{ token, platform }` | Push works via polling fallback (60s refetch on Bookings) |

---

## 7. Owner App: Known Gaps & Dev Fallback Behavior

| Gap | Current Behavior |
|-----|------------------|
| Invite-code auth endpoints missing | Dev fallback: owner enters ANY code (e.g. `LUNAO-TEST-1234`), app stubs a profile by fetching `/api/sites` and using the first site |
| Conversations endpoints missing | Empty state with illustration + message on Chats screen |
| Push endpoints missing | Polling fallback: Bookings screen refetches every 60s; notifications still show in-app toast when foregrounded |
| Sound files missing (6 in `assets/sounds/`) | App skips audio silently, still fires haptics on every action |
| App icons missing (`icon.png`, `splash.png`) | Expo Go shows default icons during development |

---

## 8. Credit Economy + Telnyx SMS Pipeline (the engine)

This is the real revenue path. Both the dashboard and the Owner App see credits as a unified balance, with the **backend as the source of truth**.

### 8.1 Cost model

| Action | Credits |
|---|---|
| Google Maps crawl (per 3 listings) | 1 |
| Outreach + site deploy per lead (up-front charge) | 4 (1 site + 3 SMS reserved) |
| SMS send failure | -3 (refund) |
| Site-gen failure | -1 (refund) |
| Plan top-up | +N (Free 5, Starter 300, Growth 1000, Pro 3000, Agency 7000) |

All charges happen at the start of a campaign; refunds happen automatically as leads succeed or fail. The dashboard's `localStorage` copy is reconciled against `/api/credits` after every campaign run — it can never be the authoritative answer.

### 8.2 Server-side flow (POST /api/campaign/run)

1. **Pre-flight credit check** (`checkBalance`). If insufficient → return `402 { error, needed, available }` as a clean JSON response (no SSE stream opened, no campaign row created).
2. **Create campaign** row in SQLite. Returns `campaignId`.
3. **Charge** exactly `totalLeads × 4` credits with `reason: 'campaign_charge'`, `ref_type: 'campaign'`, `ref_id: <campaignId>`. Single ledger row, atomic.
4. **Open SSE stream**. Emit `campaign` event with the id, then per-lead events.
5. **Phase A (per lead)**: compile + stage site. On failure: `recordLeadResult('failed')` + `refund(1, 'site_failed_refund')`.
6. **Phase B (batch)**: publish staged sites to Cloudflare Pages (single `publishBatch()`).
7. **Phase C (per lead)**: write a row in `sms_logs` with `status: 'queued'`, then call Telnyx. On success: `recordLeadResult('sent')` + `updateSmsStatus({ status: 'sent', telnyx_id })`. On failure: `refund(3, 'sms_failed_refund')`. On `'simulated'`: record `simulated` status.
8. **Finalize**: `finalizeCampaign()` aggregates per-lead outcomes into the campaign row (`sites_generated`, `sms_sent`, `sms_failed`, `sms_skipped`).

### 8.3 Telnyx integration

`server/lib/telnyx.js` does raw HTTPS `fetch` to `https://api.telnyx.com/v2/messages` (no SDK). When `SMS_ENABLED=true && TELNYX_API_KEY && TELNYX_PHONE_NUMBER` the pipeline is `live`; otherwise it is `dry-run` (simulated) or `coming-soon` (master switch off, no API call at all).

**Retry policy** (`sendSms`): 3 attempts, exponential backoff (500ms, 1s). Permanent Telnyx error codes (`10001-10006`, `40002-40004`, `40010`) skip retry and fail fast. Transient HTTP errors (5xx, 429, network) retry.

**E.164 normalization** (`toE164`): 10-digit US → `+1XXXXXXXXXX`, 11-digit starting with 1 → `+1XXXXXXXXXX`, already-E.164 → passthrough.

**Segment counting** (`countSegments`): approximation of Telnyx's billed segment count, stored in `sms_logs.segment_count` for billing reconciliation.

**Delivery upgrades** (`fetchMessageStatus`): right after a successful send, the pipeline makes one best-effort `GET /v2/messages/{id}` to upgrade `sent` → `delivered` synchronously. The `POST /api/webhooks/telnyx` endpoint is the authoritative async path for the same upgrade.

### 8.4 Telnyx webhook handler

`POST /api/webhooks/telnyx` accepts both:
- `message.received` → inbound SMS. Logged in `sms_inbound` with `kind: 'inbound'`. Future: match `from` against `campaign_leads.phone` and trigger the "YES" → publish flow.
- `message.delivered` / `message.failed` / `message.sent` → delivery receipts. Looked up by `telnyx_id` in `sms_logs`, used to upgrade `sms_logs.status` and the linked `campaign_leads.sms_status`. The endpoint **always returns 200** to avoid Telnyx retry storms; failures are logged server-side.

Configure in Telnyx Mission Control: **Messaging → Webhooks → POST `https://<your-api>/api/webhooks/telnyx`**.

### 8.5 DB tables added (server/.data/lunao.db)

| Table | Purpose |
|---|---|
| `credit_accounts` | One row per `owner_key`. Holds `plan`, `balance`, `lifetime_used`, `lifetime_refunded`. |
| `credit_ledger` | Append-only ledger. Every charge + refund + plan topup. Idempotent refunds via `UNIQUE(reason, ref_type, ref_id)`. |
| `campaigns` | One row per campaign. Aggregates per-lead outcomes. |
| `campaign_leads` | One row per lead inside a campaign. Holds `site_status`, `sms_status`, `sms_error`. |
| `sms_logs` | One row per SMS send attempt. Holds `telnyx_id`, `error_code`, `error_message`, `segment_count`, `refunded`. |
| `sms_inbound` | All inbound webhooks + delivery receipts for audit + future reply handling. |

### 8.6 Env vars

| Var | Required for | Current value |
|---|---|---|
| `SMS_ENABLED` | Master kill-switch for outbound SMS | **`"true"`** (live) |
| `TELNYX_API_KEY` | Bearer auth on `api.telnyx.com` | set |
| `TELNYX_PHONE_NUMBER` | `from` for every outbound message | `+1XXXXXXXXXX` |
| `TELNYX_MESSAGING_PROFILE_ID` | Telnyx messaging profile id | set |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages deploy | set |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | set |
| `CLOUDFLARE_PAGES_PROJECT` | Pages project name | `sms-bulk-pages` |

---

## 9. How to Test Right Now (5 Minutes)

### Prerequisites
- Node.js + npm installed
- Backend Express server running on port 8787 (separate project)
- OR use dev fallback (works even without backend!)

### Steps

```bash
# 1. Navigate to the Owner App folder
cd lunaoexpoapp

# 2. Install dependencies
npm install

# 3. Set the ONE env var
cp .env.example .env
# edit .env → set EXPO_PUBLIC_API_BASE_URL to your machine's LAN IP
# e.g. http://192.168.1.42:8787  (NOT localhost — physical device needs LAN IP)
# For simulator: http://localhost:8787

# 4. Start dev server
npx expo start

# 5. Scan QR with Expo Go (iOS: Camera app, Android: Expo Go → Scan QR)
```

### Test Without Backend (Dev Fallback)
If the backend isn't running, the app **automatically falls into dev mode**:
1. Open app → Enter ANY code (e.g. `LUNAO-TEST-1234`)
2. App stubs a profile from the first site in `/api/sites`
3. You can test bookings (if backend has data), editor, settings — everything except invite auth

### Quick Test Checklist
```
□ App opens → shows login screen
□ Enter code LUNAO-ABCD-EFGH → redirects to home (dev or real)
□ Home shows stat cards + recent activity
□ Bookings tab → list loads, tap a booking → confirm/cancel works
□ Chats tab → shows empty state (expected, endpoints not built)
□ Editor tab → WebView loads site, tap an image/text to edit, Save + Deploy
□ Settings → theme toggle, sign out works
```

### Smoke-Test the SMS Pipeline (60 seconds, real Telnyx)
With the backend running on `localhost:8787` and `SMS_ENABLED=true`:

```bash
# 1. Top up an account on the Growth Plan
curl "http://localhost:8787/api/credits?ownerKey=me&plan=Growth%20Plan"
# -> { "account": { "balance": 1000, ... } }

# 2. Send a single test SMS to your own phone
curl -X POST http://localhost:8787/api/test-sms \
  -H "Content-Type: application/json" \
  -d '{"to":"+1YOURNUMBER","ownerKey":"me"}'
# -> { "ok": true, "status": "sent", "id": "40319ecc-..." }

# 3. Run a 1-lead campaign (charges 4 credits, deploys a site, sends SMS)
curl -X POST http://localhost:8787/api/campaign/run \
  -H "Content-Type: application/json" \
  -d '{"businesses":[{"name":"My Biz","phone":"+1YOURNUMBER","city":"Austin","niche":"barber"}],"ownerKey":"me","plan":"Growth Plan","name":"smoke"}'

# 4. Inspect the persisted campaign + sms logs
curl "http://localhost:8787/api/campaigns?ownerKey=me"
curl "http://localhost:8787/api/owner/sms?ownerKey=me"
```

Watch the server console — you'll see `Telnyx SMS : LIVE` on boot and real `POST https://api.telnyx.com/v2/messages` calls in the logs.

---

## 10. How to Deploy to Cloud

### Backend → Railway

1. Push backend repo to GitHub
2. On Railway: New Project → Deploy from GitHub
3. Set env vars:
   - `PORT` = 8787
   - `SMS_ENABLED` = `"true"` (real Telnyx SMS)
   - `TELNYX_API_KEY`
   - `TELNYX_PHONE_NUMBER`
   - `TELNYX_MESSAGING_PROFILE_ID` (optional, recommended)
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PAGES_PROJECT`
   - `CLOUDFLARE_PAGES_BRANCH` (default `main`)
   - `GEMINI_API_KEY` (optional, chatbot falls back to rules)
   - `ANTHROPIC_API_KEY` (optional, enables AI Site Editor)
   - `SITE_BASE_URL` (optional, overrides the Cloudflare pages.dev URL inside SMS)
4. Railway gives you a URL like `https://lunao-api.up.railway.app`
5. Update `EXPO_PUBLIC_API_BASE_URL` in the Owner App `.env` to point there
6. Configure Telnyx webhook in Mission Control to point at `https://<your-railway>/api/webhooks/telnyx` for inbound SMS + delivery receipts

### Owner App → EAS (Expo Application Services)

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login
eas login

# 3. Build
eas build --platform ios --profile production
eas build --platform android --profile production

# 4. Submit to stores (optional)
eas submit --platform ios
eas submit --platform android
```

Or for a quick web build:
```bash
npx expo export --platform web
# deploy the dist/ folder to any static host
```

---

## 11. Key Architecture Rules

1. **ONE env var:** `EXPO_PUBLIC_API_BASE_URL` — only thing the app reads for the host. Never hardcode.
2. **One-business scoping:** After login, every request sends `Authorization: Bearer <token>` and is scoped to the owner's `slug`.
3. **Never crash:** If a backend endpoint 404s or fails, show a clean empty state. The app must be fully usable even if push never arrives.
4. **Branding:** Business name appears top-right on every screen. Theme (colors, font, radius) is derived from the business's `niche`.
5. **Monogram:** Business initial on accent gradient used as logo everywhere.

---

## 12. Tech Stack (Full)

| Layer | Tech |
|-------|------|
| App | Expo SDK 54, React Native 0.81, React 19, TypeScript |
| Nav | expo-router (file-based) |
| State | @tanstack/react-query (server), Context (client) |
| Storage | expo-secure-store (token), AsyncStorage (settings) |
| Notifications | expo-notifications |
| Audio | expo-audio |
| Haptics | expo-haptics |
| Animation | react-native-reanimated |
| Fonts | expo-font + Google Fonts (Playfair, Fraunces, Plus Jakarta, Manrope, Inter) |
| Backend | Express + SQLite (→ Postgres on Railway) |
| Deploy | Cloudflare Pages (sites) + Railway (API) |

---

## 12. Authentication System (v2 — Site Gate)

Lunao v2 uses a **single shared password gate** instead of per-user accounts. There is no email/password registration.

### How it works

```
Visitor clicks "Start free" on landing page
  └─> window.location.href = '/site-gate'
        └─> site-gate.html form rendered
              └─> Visitor types password → POST /api/site-gate
                    └─> bcrypt.compare(password, hash) === true
                          └─> Set httpOnly cookie `lunao_site_gate` (JWT, 12h TTL)
                          └─> Redirect to /app
                          └─> DashboardApp renders
```

### Password configuration (priority order)

| Env var | Effect |
|---------|--------|
| `SITE_GATE_PASSWORD` | Plain text — server bcrypt-hashes it on startup |
| `SITE_GATE_PASSWORD_HASH` | Pre-hashed bcrypt string (for production) |
| None | Hardcoded default: `$Khan1234455` |

### Security features

- **Rate limiting**: 5 failed attempts per IP → 15-minute lockout (in-memory, resets on server restart)
- **12h session cookie**: `lunao_site_gate`, httpOnly, signed with `SITE_GATE_JWT_SECRET`
- **Middleware guard**: Express middleware wraps 11 path prefixes (`/app`, `/dashboard`, `/sites`, `/templates`, `/api/ai`, `/api/owner`, etc.)
- **SPA compatibility**: `GateProvider` in React polls `GET /api/site-gate/status` and shows the Landing page while `unlocked === false`

### Files involved

- `server/lib/siteGate.js` — gate logic (hash, JWT secret, rate limiter, cookie helpers)
- `public/site-gate.html` — standalone password entry page (no JS framework dependency)
- `server/index.js` — `POST /api/site-gate`, `POST /api/site-gate/logout`, `GET /api/site-gate/status` routes
- `src/contexts/GateContext.tsx` — React context mirroring gate state
- `src/Landing.tsx` — `openDashboard()` navigates to `/site-gate` directly

### Legacy auth (archived, not active)

`server/lib/_archive_auth.js` contains a full per-user auth system (bcrypt passwords, JWT sessions, Google OAuth, `users` table) but it is **not wired into `server/index.js`** — no `app.post('/api/auth/register', ...)` etc. calls exist. To re-enable per-user auth, import and wire those functions into `server/index.js`.

---

## 13. File Map

```
app/                         # Remix app (Vite dev server :3000, proxy :8787 → Express)
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx      # Home tab
│   │   ├── Campaigns.tsx       # Launch wizard (CSV, Google Maps, template picker)
│   │   ├── Editor.tsx          # Site editor + TemplateLab panel
│   │   ├── Templates.tsx       # Template gallery
│   │   ├── Messages.tsx        # Outreach / SMS log viewer
│   │   ├── Settings.tsx         # API keys, billing, invite codes
│   │   ├── Plans.tsx           # Plan upgrade UI
│   │   └── CelebrationEffect.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx    # (legacy, unused in v2)
│   │   └── GateContext.tsx     # Password gate state (v2)
│   ├── lib/
│   │   └── pipelineClient.ts  # All browser→API calls (SSE streaming, auth)
│   ├── landing/                # Marketing landing page
│   │   ├── sections/         # Nav, Hero, Pricing, etc.
│   │   └── components/
│   ├── data/                  # Mock data, niche lists, template metadata
│   └── utils/
│       └── audio.ts           # Web Audio API synthesis engine
│
server/                      # Express API (port 8787)
├── index.js                 # All routes + middleware
├── lib/
│   ├── auth.js              # (archived) per-user auth — NOT wired
│   ├── _archive_auth.js    # Full legacy auth impl — NOT wired
│   ├── siteGate.js         # v2 password gate logic
│   ├── db.js               # SQLite + Postgres adapter
│   ├── compile.js          # Template compilation engine
│   ├── anthropic.js        # Claude AI calls (streamEdit + generateTemplateHtml)
│   ├── pipeline.js         # Campaign orchestrator (compile → stage → SMS)
│   ├── csv.js              # CSV parsing + validation
│   ├── cloudflare.js       # CF Pages publish
│   ├── telnyx.js          # SMS send/receive
│   ├── credits.js          # Credit ledger
│   ├── campaigns.js         # Campaign/lead/SMS CRUD
│   ├── bookings.js         # Booking widget DB
│   ├── chatbot.js          # Rule-based + Gemini chatbot
│   ├── widget.js          # Booking/chat widget injection
│   ├── sites.js           # Site file I/O
│   ├── inviteCodes.js      # Agency handoff codes
│   └── slug.js            # URL slug utilities
├── .data/                  # SQLite DB, generated sites (gitignored)
└── .sites/                # Compiled site HTML (gitignored)

public/
├── templates-raw/         # 8 master niche templates (RAW — never edit)
│   ├── barber-template.html
│   ├── barber-template-02.html
│   ├── salon-template-01.html
│   ├── dentist-template-01.html
│   ├── hvac-template-01.html
│   ├── gym-template-01.html
│   ├── realestate-template-01.html
│   └── roofing-template-01.html
├── site-gate.html          # Standalone password page
└── *.html                 # Live preview mirrors

scripts/
├── db-migrate.mjs         # SQLite → Postgres migration
└── db-backup.mjs          # SQLite backup
```

---

## 14. Template Lab — AI-Powered Custom Template Generation

A fully integrated feature letting users create custom website templates from a free-text prompt. Templates are stored in the DB with two HTML versions (raw with `{{PLACEHOLDERS}}` and preview with demo data) and are usable in the Campaigns wizard.

### 14.1 Database Tables

**`template_categories`** — user-defined groupings for custom templates:
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | e.g. `cat_1749...` |
| `owner_key` | TEXT NOT NULL | per-user scoping |
| `name` | TEXT NOT NULL | Display name |
| `color` | TEXT DEFAULT '#2563EB' | Hex color for UI badges |
| `icon` | TEXT DEFAULT 'layout' | Lucide icon name |
| `sort_order` | INTEGER DEFAULT 0 | Manual ordering |
| `created_at` | INTEGER | Unix timestamp |

**`custom_templates`** — generated template storage:
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | e.g. `tmpl_1749...` |
| `owner_key` | TEXT NOT NULL | per-user scoping |
| `category_id` | TEXT | FK → template_categories (nullable) |
| `name` | TEXT NOT NULL | Display name |
| `slug` | TEXT NOT NULL | URL-safe identifier |
| `niche` | TEXT NOT NULL DEFAULT '' | Business niche tag |
| `raw_html` | TEXT NOT NULL | Full HTML with `{{PLACEHOLDERS}}` |
| `preview_html` | TEXT NOT NULL | Full HTML with demo values filled in |
| `style_tags` | TEXT DEFAULT '' | Comma-separated tags |
| `used_count` | INTEGER DEFAULT 0 | Campaign usage counter |
| `created_at` | INTEGER | Unix timestamp |

### 14.2 Placeholder Rules — Strict "3 by Default" System

**Core placeholders (always allowed — AI must use them):**
```
{{BUSINESS_NAME}}   — required everywhere the business name appears
{{CITY}}            — required for city/location
{{PHONE_DISPLAY}}   — required for human-readable phone (visible text)
{{PHONE_RAW}}       — required for tel: links (href="tel:{{PHONE_RAW}}")
```

**Extra placeholders (auto-unlocked if user mentions them in prompt):**

| User prompt mentions | Placeholder unlocked |
|--------------------|---------------------|
| "state" | `{{STATE}}` |
| "years in business" | `{{YEARS_IN_BUSINESS}}` |
| "email" | `{{EMAIL}}` |
| "address" | `{{ADDRESS}}` |
| "google rating" / "reviews" / "stars" | `{{GOOGLE_RATING}}`, `{{GOOGLE_REVIEW_COUNT}}` |
| "instagram" / "IG" | `{{INSTAGRAM_HANDLE}}` |
| "facebook" / "fb" | `{{FACEBOOK_URL}}` |
| "website url" / "site link" / "url" | `{{SITE_URL}}` |
| "doctor" / "dr." | `{{DOCTOR_NAME}}` |
| "trainer" | `{{TRAINERS_COUNT}}` |
| "member" | `{{MEMBERS_COUNT}}` |

**Hardcoded brand names — ZERO tolerance:**
- `findHardcodedBrandNames()` scans raw HTML for suspicious capitalized phrases
- If any are found, the template is **rejected** and 2 credits are refunded
- The AI is instructed to build Instagram/Facebook/email text from `{{BUSINESS_NAME}}` if the specific placeholder isn't allowed (e.g., "Find us on Facebook" linking to `{{BUSINESS_NAME}} on Facebook`)

### 14.3 Compile Engine Priority

When `compileSite(biz, templateKey)` is called during a campaign:
1. **Try `custom_templates` DB** — `findCustomTemplate(templateKey)` checks by `id` OR `slug`
2. **Fall back to built-in** — `NICHE_TEMPLATE_MAP` → `/public/templates-raw/*.html`

The Campaigns wizard now sends `templateId` (e.g. `tmpl_xxxxx`) instead of just `niche`, so custom templates are used when selected.

### 14.4 Credit Cost

| Action | Credits |
|--------|---------|
| Generate 1 custom template | 2 |
| Use custom template in campaign | 4 per lead (same as built-in) |

Generation failures trigger an automatic refund (`template_gen_failed_refund`).

### 14.5 Frontend UI

- **Template Lab hero** — dark gradient banner in the Editor list view with "Browse Templates" and "Create New" CTAs
- **CreateTemplateModal** — full-screen slide-up sheet with niche picker, category selector, prompt textarea, sample prompts, and live preview iframe after generation
- **BrowseTemplatesSheet** — split-panel browser with category sidebar (desktop) / scrollable pills (mobile), template grid with iframe thumbnails, inline delete with confirmation
- **Campaigns wizard Step 3** — custom templates appear with a violet accent and "AI" badge alongside built-in templates
