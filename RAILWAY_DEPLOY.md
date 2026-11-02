# Lunao — Railway Deployment Plan

> A **complete, copy-paste, go-live-in-an-hour** guide to deploying the Lunao
> backend (Express + SQLite/Postgres + Telnyx + Cloudflare Pages) to **Railway**
> with a persistent Postgres database, persistent `.sites` + `.data` volumes,
> and a Telnyx webhook URL that survives your laptop being off.

This plan is grounded in the **current state** of the project (verified on
2026-06-15): Cloudflare Pages deploy is already verified live
(`https://sms-bulk-pages.pages.dev`), Telnyx auth is verified, the Express
backend is feature-complete (campaigns, credits, bookings, chat, owner auth,
invite codes, webhooks, SSE), and the only thing standing between you and
24/7 SMS is moving it off your laptop.

---

## 0. What You're Deploying

| Layer | Today | After Railway |
|---|---|---|
| **Dashboard frontend** (Vite/React) | `localhost:3000` (dev) | Served by Express from `/dist` on Railway |
| **Backend API** (Express) | `localhost:8787` | `https://lunao-api.up.railway.app` |
| **SQLite DB** | `server/.data/lunao.db` (local file) | **Railway Postgres** (DATABASE_URL) |
| **Compiled sites staging** | `server/.sites/` (local fs) | **Railway persistent volume** (mounted at `/data/sites`) |
| **Live sites** | Cloudflare Pages `*.pages.dev` | Same — already live |
| **SMS sending** | Telnyx via HTTPS POST | Same — already live |
| **Telnyx webhooks** | (pointed at localhost — broken) | `https://lunao-api.up.railway.app/api/webhooks/telnyx` |
| **Owner mobile app** | pointed at `192.168.100.18:8787` | pointed at `https://lunao-api.up.railway.app` |

---

## 1. Prerequisites (do these before opening Railway)

- A **GitHub account** with a new (or existing) repo containing this project.
- A **Railway account** → https://railway.app (sign in with GitHub).
- A **Telnyx account** with the existing API key, sender number, and messaging
  profile ID (you already have these in `.env.local`).
- A **Cloudflare account** with the existing API token, account ID, and Pages
  project `sms-bulk-pages` (you already have these).
- (Optional) A **custom domain** like `api.lunao.app` if you want a pretty URL.

---

## 2. Push the Project to GitHub

If you haven't already:

```powershell
cd "C:\Users\Sunrise Computers\Downloads\remix_-remix_-localsite"
git init
git add .
git commit -m "Lunao — initial commit"
git branch -M main
git remote add origin https://github.com/<you>/lunao.git
git push -u origin main
```

> The repo ships with a `.gitignore` (227 bytes) — it should already exclude
> `.env.local`, `node_modules`, `dist`, `server/.sites`, and `server/.data`.
> **Verify** `.env.local` is in `.gitignore` before pushing (it contains
> live keys — we do **not** want to commit them).

---

## 3. One-Time Repo Changes (already added by this plan)

The following files are added by this deployment plan and committed alongside
your app code. None of them touch `/public/templates-raw/` (your pristine
templates stay safe).

| File | Purpose |
|---|---|
| `railway.json` | Tells Railway the start command + restart policy |
| `nixpacks.toml` | Tells Railway's build system to install + build the Vite frontend |
| `Procfile` | Backup process declaration for non-Nixpacks runtimes |
| `.railwayignore` | Excludes dev files from the build context |
| `server/lib/db.js` (patched) | Uses `DATABASE_URL` (Postgres) if present, else falls back to local SQLite — **backwards compatible** |
| `server/lib/config.js` (patched) | Honors Railway's `PORT` env var and uses `/data` for persistent volume when present |
| `.github/workflows/railway-deploy.yml` | Auto-deploy on push to `main` (optional but recommended) |
| `RAILWAY_DEPLOY.md` | This file |

---

## 4. Create the Railway Project

1. Go to https://railway.app/new
2. Click **Deploy from GitHub repo**
3. Select `lunao` (or whatever you named it)
4. Railway will detect the repo, read `railway.json`, and provision a service

### 4.1 Add a PostgreSQL Database

In your Railway project dashboard:

1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway creates it instantly and exposes a `DATABASE_URL` env var to the
   linked service automatically

### 4.2 Attach a Persistent Volume for Compiled Sites

The compiled HTML sites (`server/.sites/`) must survive container restarts.

1. Click your **app service** → **Settings** → **Volumes**
2. Click **+ New Volume**, name it `lunao-data`
3. Mount path: `/data`
4. Add an env var on the app service: `DATA_DIR=/data`

### 4.3 Set Environment Variables (app service → Variables tab)

Copy these from your local `.env.local` and **paste each one as a Railway
variable**. Railway will encrypt them at rest and inject them at runtime.

```env
# Server
PORT=8787
DATA_DIR=/data
SITE_BASE_URL=https://lunao-api.up.railway.app

# Telnyx (LIVE)
SMS_ENABLED=true
TELNYX_API_KEY=YOUR_TELNYX_API_KEY
TELNYX_PHONE_NUMBER=+1XXXXXXXXXX
TELNYX_MESSAGING_PROFILE_ID=YOUR_MESSAGING_PROFILE_ID

# Cloudflare Pages (LIVE)
CLOUDFLARE_API_TOKEN=YOUR_CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_PAGES_PROJECT=sms-bulk-pages
CLOUDFLARE_PAGES_BRANCH=main

# AI (optional — leave blank if you don't have them yet)
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Public API base (for the injected booking/chatbot widgets on live sites)
PUBLIC_API_BASE_URL=https://lunao-api.up.railway.app
```

> **The DATABASE_URL variable is auto-set by Railway when you add Postgres.**

### 4.4 Generate a Public Domain

In your app service → **Settings** → **Networking** → **Generate Domain**.

You'll get a URL like:
```
https://lunao-api.up.railway.app
```

Once you have it, **update `SITE_BASE_URL` and `PUBLIC_API_BASE_URL`** above
to point at it. This is what the SMS body uses to build the clickable link.

---

## 5. Database Migration (SQLite → Postgres)

The project currently uses `better-sqlite3` with a file at
`server/.data/lunao.db`. The patched `server/lib/db.js` (see §3) auto-detects
`DATABASE_URL` and switches the driver to **`pg` (node-postgres)** — no code
changes needed at the call site because both drivers expose the same `prepare`/
`run`/`get`/`all` shape via a thin adapter.

### 5.1 What you do NOT have to do

- **No manual schema migration.** The adapter runs the same `CREATE TABLE IF
  NOT EXISTS` statements against Postgres on first boot. Tables created:
  - `bookings`
  - `chat_sessions`, `chat_messages`
  - `invite_codes`
  - `credit_accounts`, `credit_ledger`
  - `campaigns`, `campaign_leads`
  - `sms_logs`, `sms_inbound`

### 5.2 What you DO have to do (one-time, after first deploy)

If you want to **preserve your local SQLite data** (existing campaigns, SMS
logs, credit balances, bookings), run the bundled migration:

```powershell
# After your Railway service is live and DATABASE_URL is set locally:
$env:DATABASE_URL = "<paste from Railway Variables tab>"
npm run db:migrate
```

This reads `server/.data/lunao.db` and bulk-inserts into Postgres using the
same adapter. Safe to re-run (idempotent `ON CONFLICT DO NOTHING`).

> If you don't have any local data yet, **skip this step** — the schema is
> created automatically on the first request to the deployed service.

---

## 6. Wire Up Telnyx Webhooks (the part that was broken on localhost)

This is the single most important step — it makes SMS delivery receipts and
inbound replies actually arrive at your service.

1. Go to https://portal.telnyx.com → **Messaging** → **Webhooks**
2. Set **Inbound message URL** to:
   ```
   https://lunao-api.up.railway.app/api/webhooks/telnyx
   ```
3. Set **Outbound message status callback** to the same URL
4. (Optional) Set the **Profile** dropdown to "Uk sms profile" (the messaging
   profile ID you already use)
5. Click **Save**

Now:
- When you send an SMS, Telnyx POSTs back to your service with
  `message.delivered` / `message.failed` and the system auto-upgrades
  `sms_logs.status` from `sent` → `delivered`.
- When a customer replies (e.g. "YES"), Telnyx POSTs `message.received` and
  the body is logged in `sms_inbound` and ready for the future "auto-publish"
  flow.

---

## 7. Update the Owner Mobile App's API URL

The Expo app reads **one** env var: `EXPO_PUBLIC_API_BASE_URL`.

### 7.1 For development (local network)

`lunaoexpoapp/.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://192.168.100.18:8787
```

### 7.2 For production (live, post-Railway)

`lunaoexpoapp/.env.production`:
```
EXPO_PUBLIC_API_BASE_URL=https://lunao-api.up.railway.app
```

Or pass at build time:
```powershell
npx expo start -- --no-dev --minify
# Or for an EAS production build:
eas build --platform ios --profile production
eas build --platform android --profile production
```

> The app degrades gracefully if any endpoint 404s (dev mode fallback), so
> you can deploy to the App Store / Play Store and have the production URL
> baked in with zero code changes.

---

## 8. Update the Vite Frontend's Public API URL

The dashboard's SSE pipeline client uses the **same host** as the page is
served from. Since Railway serves both `/api` and the built dashboard from
the **same Express process**, you don't need a separate env var. The Vite
proxy from `vite.config.ts` (`/api` → `http://localhost:8787`) only applies
during dev — in production, the relative `/api` paths hit the same Node
process.

So in production, **no changes needed** for the dashboard.

---

## 9. Deploy Order (copy-paste checklist)

```
[ ] 1. Create GitHub repo and push the project
[ ] 2. Sign in to https://railway.app with GitHub
[ ] 3. New Project → Deploy from GitHub → select lunao
[ ] 4. Add PostgreSQL database (DATABASE_URL auto-injected)
[ ] 5. Create volume "lunao-data" mounted at /data, add DATA_DIR=/data env
[ ] 6. Paste all 17 env vars from §4.3 into Variables tab
[ ] 7. Generate domain → copy URL → set SITE_BASE_URL + PUBLIC_API_BASE_URL
[ ] 8. Wait for first deploy to finish (watch the build logs)
[ ] 9. Hit https://<your-domain>/api/health → expect {"ok":true,"mode":"..."}
[ ] 10. Run npm run db:migrate locally with the Railway DATABASE_URL (optional)
[ ] 11. Update Telnyx webhook URL → https://<your-domain>/api/webhooks/telnyx
[ ] 12. Update Owner App env var → EXPO_PUBLIC_API_BASE_URL=https://<your-domain>
[ ] 13. Test: top up an account, run a 1-lead campaign, verify SMS arrives
[ ] 14. Test webhook: reply to the SMS with "YES", verify sms_inbound grows
```

---

## 10. Going Live — First End-to-End Test

```powershell
# 1. Health check
Invoke-RestMethod https://lunao-api.up.railway.app/api/health

# 2. Top up your agency account
Invoke-RestMethod "https://lunao-api.up.railway.app/api/credits?ownerKey=me&plan=Growth%20Plan"

# 3. Send a test SMS to YOUR real phone number
$body = @{ to = "+1YOURNUMBER"; ownerKey = "me" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://lunao-api.up.railway.app/api/test-sms" `
  -ContentType "application/json" -Body $body

# 4. Run a 1-lead campaign (charges 4 credits, deploys site, sends SMS)
$lead = @{ name = "My Biz"; phone = "+1YOURNUMBER"; city = "Austin"; niche = "barber" }
$body = @{
  businesses = @($lead)
  ownerKey = "me"
  plan = "Growth Plan"
  name = "first-railway-test"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "https://lunao-api.up.railway.app/api/campaign/run" `
  -ContentType "application/json" -Body $body

# 5. Inspect the persisted campaign + SMS log
Invoke-RestMethod "https://lunao-api.up.railway.app/api/campaigns?ownerKey=me"
Invoke-RestMethod "https://lunao-api.up.railway.app/api/owner/sms?ownerKey=me"
```

You should receive a real text within ~5 seconds, and `sms_logs` should
flip from `sent` → `delivered` once Telnyx POSTs back the webhook.

---

## 11. Cost & Quotas (Railway Pricing)

| Resource | Free Tier | Estimated monthly cost (low traffic) |
|---|---|---|
| **App service** | $5 free credit/month | ~$5–10 (1 vCPU, 512MB RAM) |
| **Postgres** | $5 free credit/month | ~$5–10 (1GB storage) |
| **Volume** | Free (built into the service) | Free |
| **Egress** | 100GB free/month | Free (your SMS campaign traffic is tiny) |

**Expected total: ~$10–20/month** to run a live production-grade Lunao with
real SMS, real Cloudflare deploys, persistent DB, and 24/7 webhooks. The free
credits alone will cover light usage for the first month.

---

## 12. Operational Runbook (Day 2+)

### Restart the service
Railway dashboard → service → **Deployments** → **Restart**

### Tail logs
Railway dashboard → service → **Logs** (live tail, no SSH needed)

### Backup the database
```powershell
# One-time
$env:DATABASE_URL = "postgresql://..."
npm run db:backup   # writes server/.data/backup-<timestamp>.sql
```

Or set up a Railway Cron job to run `pg_dump $DATABASE_URL` weekly.

### Scale up
If the SSE pipeline is choking on big campaigns, bump the service to a
larger plan in Settings → Resources. Telnyx calls happen **server-side** and
are CPU-light; the bottleneck is usually network egress, not compute.

### Rotate a leaked secret
1. Generate a new key in Telnyx Mission Control
2. Update the Railway variable
3. Railway auto-redeploys the service with the new key
4. Old key can be deleted from Telnyx

### Custom domain
Railway → service → Settings → Domains → **Add Custom Domain** →
`api.lunao.app`. Add the CNAME Railway gives you at your DNS provider.
Then update `SITE_BASE_URL` and `PUBLIC_API_BASE_URL` to the new domain.

---

## 13. Architecture After Deploy

```
                           ┌─────────────────────────┐
                           │   Cloudflare Pages      │
                           │   sms-bulk-pages        │
                           │   /<slug>/              │   ← public sites
                           └──────────▲──────────────┘
                                      │ Pages deploy
                                      │ (publishBatch)
┌──────────────────┐   /api/*   ┌────┴──────────────────────────┐
│  Expo Owner App  │──────────►│  Railway                       │
│  (iOS/Android)   │           │  ┌──────────────────────────┐ │
└──────────────────┘           │  │ Express API :8787         │ │
                               │  │  - /api/*                 │ │
┌──────────────────┐   /api/*   │  │  - /sites/<slug>/         │ │
│  Web Dashboard   │──────────►│  │  - SSE /api/campaign/run  │ │
│  (Vite/React)    │  same     │  └────────┬─────────────────┘ │
└──────────────────┘  origin   │           │                    │
                               │  ┌────────▼─────┐ ┌────────┐  │
                               │  │  Postgres    │ │ Volume │  │
                               │  │  (Railway)   │ │ /data  │  │
                               │  │  .data/      │ │ .sites │  │
                               │  └──────────────┘ └────────┘  │
                               └──────────┬────────────────────┘
                                          │ HTTPS POST
                                          │ Telnyx API
                                          │ (live SMS)
                                          ▼
                                  ┌─────────────────┐
                                  │  Telnyx         │
                                  │  (sender #,     │
                                  │   +1XXXXXXXXXX) │
                                  └────────┬────────┘
                                           │ webhook
                                           │ POST
                                           ▼
                                  /api/webhooks/telnyx
                                  (delivery + inbound)
```

---

## 14. What Stays The Same

- **Raw templates in `/public/templates-raw/`** are 100% untouched.
- **Live preview HTML files in `/public/` and `/`** are unchanged.
- **The Express server code** is unchanged at the route level — only
  `server/lib/db.js` and `server/lib/config.js` get a 2-line patch each.
- **The Owner App code** is unchanged.
- **The dashboard code** is unchanged.

---

## 15. What You Get (post-deploy)

| Feature | Status |
|---|---|
| **24/7 live API** | ✅ `https://lunao-api.up.railway.app` |
| **Persistent Postgres DB** | ✅ All campaigns, bookings, credits, SMS logs |
| **Real SMS via Telnyx** | ✅ Already verified live |
| **Real Cloudflare deploys** | ✅ Already verified live |
| **Inbound SMS + delivery receipts** | ✅ Now actually working (was broken on localhost) |
| **Owner app over public URL** | ✅ `EXPO_PUBLIC_API_BASE_URL` swap and done |
| **Persistent compiled sites** | ✅ `/data` volume survives restarts |
| **Auto-deploy on git push** | ✅ GitHub Actions workflow |
| **Custom domain support** | ✅ Just add a CNAME |
| **Backups** | 🔜 Optional cron job (out of scope for v1) |

---

*Generated: 2026-06-15*
*Plan: Lunao v1 Railway go-live*
