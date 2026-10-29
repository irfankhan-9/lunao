# Lunao — Setup & Real Pipeline Guide

This project is a SaaS dashboard **plus** a real end-to-end campaign pipeline:

```
CSV leads ──► compile pristine template ──► deploy to Cloudflare Pages ──► send SMS (Telnyx) with the live link
```

It runs in two modes automatically:

| Mode | When | Behavior |
|---|---|---|
| **DRY-RUN** | no API keys set | Sites are compiled for real and served locally; SMS are simulated/logged. Test the whole flow instantly. |
| **LIVE** | keys present in `.env.local` | Sites deploy to Cloudflare Pages; real SMS sent via Telnyx. |

The initial version works from a **CSV only** — no Google Maps API required.

---

## 1. Install

```bash
npm install
```

## 2. Run everything (dashboard + pipeline API)

```bash
npm run dev:all
```

- Dashboard: http://localhost:3000
- Pipeline API: http://localhost:8787
- Compiled site previews (dry-run): http://localhost:8787/sites/<slug>/

> Prefer two terminals? Run `npm run dev` (web) and `npm run server` (API) separately.

## 3. Test the pipeline instantly (no keys needed)

From the dashboard: **Campaigns → Upload CSV → pick `sample-leads.csv` → choose template → Launch.**
Real personalized sites are generated and SMS are simulated.

Or from the command line:

```bash
npm run pipeline -- sample-leads.csv
# optional: force one niche for all rows
npm run pipeline -- sample-leads.csv barber
```

You'll see each site URL and SMS status stream live.

---

## 4. Go LIVE — paste your real keys

Copy the example file and fill it in:

```bash
cp .env.example .env.local
```

### Telnyx (SMS)
- `TELNYX_API_KEY` — from https://portal.telnyx.com (API Keys)
- `TELNYX_PHONE_NUMBER` — your purchased SMS number in **E.164** (e.g. `+15125550182`)
- `TELNYX_MESSAGING_PROFILE_ID` — optional but recommended

### Cloudflare Pages (hosting)
1. Create a Pages project once (dashboard → Workers & Pages → Create → Pages → "Direct Upload"). Name it e.g. `lunao-sites`.
2. Create an API token with **Cloudflare Pages: Edit** permission.
3. Fill in:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PAGES_PROJECT` (e.g. `lunao-sites`)
   - `CLOUDFLARE_PAGES_BRANCH` (usually `main`)

Each business goes live at `https://<project>.pages.dev/<slug>/`.
Set `SITE_BASE_URL` if you map a custom domain.

### Google Maps (FUTURE — leave blank for now)
- `GOOGLE_MAPS_API_KEY` — enables live lead discovery instead of CSV upload.

Restart the API (`npm run server`). The startup banner shows `LIVE` vs `DRY-RUN` for each integration. Re-run a campaign and it deploys + texts for real.

---

## CSV format

Headers are flexible (aliases supported). Minimum: a **Name** column. Recommended:

```csv
name,phone,city,niche,instagram,rating,reviews
Vintage Cuts Barber Lounge,(512) 555-0182,"Austin, TX",barber,vintagecuts_atx,4.9,212
```

Supported niches: `barber`, `salon`, `dentist`, `hvac`, `gym`, `roofing`, `real estate`.

---

## Architecture

```
server/
  index.js              Express API + local site hosting (+ serves built frontend)
  lib/
    config.js           env loading + LIVE/DRY-RUN detection
    compile.js          raw template -> personalized HTML (0 placeholders left)
    cloudflare.js       Cloudflare Pages deploy (wrangler) / local staging
    telnyx.js           Telnyx SMS (real / simulated)
    csv.js              dependency-free CSV parser w/ header aliases
    pipeline.js         orchestrator (compile -> deploy -> SMS), streams events
scripts/run-pipeline.mjs   CLI runner
src/lib/pipelineClient.ts  browser client (SSE) used by the dashboard
sample-leads.csv           ready-to-test leads
```

**Safety:** raw templates in `public/templates-raw/` are read-only and never modified.
Compiled output is written to `server/.sites/` (gitignored).

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | integration mode |
| POST | `/api/csv/parse` | parse CSV (`text/csv` body) → leads |
| POST | `/api/compile` | compile one business → HTML preview |
| POST | `/api/campaign/run` | run full pipeline (SSE stream) |
| GET | `/sites/<slug>/` | locally hosted compiled site (dry-run) |

## Production

```bash
npm run build      # build the dashboard
npm start          # serves API + built dashboard on :8787
```
