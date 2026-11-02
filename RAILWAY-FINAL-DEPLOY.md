# Lunao Railway Deployment - COMPLETE STEP-BY-STEP

## Architecture Summary

```
Railway (1 Service + 1 Database + 1 Volume)
├── Express API Server (serves: /api/* + /dist/* + /sites/*)
├── PostgreSQL Database (bookings, campaigns, SMS logs, credits, chat)
└── Persistent Volume /data (compiled sites survive restarts)

External Services:
├── Cloudflare Pages (site hosting - ALREADY LIVE)
├── Telnyx (SMS sending - ALREADY CONFIGURED)
├── Anthropic (AI code editor - optional)
└── Gemini (chatbot - optional)
```

---

## RAILWAY SETUP (Step by Step)

### STEP 1: Create Railway Project

1. Go to **https://railway.app** → Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Search for **"lunaosite"** → Select it
4. Railway will auto-detect `nixpacks.toml` and start building

### STEP 2: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway creates it instantly
4. **DATABASE_URL** is automatically injected into your app service's environment

### STEP 3: Mount Persistent Volume (for compiled sites)

1. Click your **app service** → **Settings** → **Volumes**
2. Click **"+ New Volume"**
3. Name: `lunao-data`
4. Mount path: `/data`
5. Click **Create**

### STEP 4: Set Environment Variables

Click your **app service** → **Variables** → Add these one by one:

```env
# ===== CORE =====
NODE_ENV=production
PORT=8787
DATA_DIR=/data

# ===== SITE BASE URL =====
# IMPORTANT: Update this AFTER you generate the Railway domain (Step 5)
SITE_BASE_URL=https://web-production-2eec.up.railway.app
PUBLIC_API_BASE_URL=https://web-production-2eec.up.railway.app

# ===== TELNYX SMS (YOUR LIVE KEYS) =====
SMS_ENABLED=true
TELNYX_API_KEY=YOUR_TELNYX_API_KEY
TELNYX_PHONE_NUMBER=YOUR_PHONE_NUMBER
TELNYX_MESSAGING_PROFILE_ID=YOUR_MESSAGING_PROFILE_ID

# ===== CLOUDFLARE PAGES (YOUR LIVE KEYS) =====
CLOUDFLARE_API_TOKEN=YOUR_CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_PAGES_PROJECT=sms-bulk-pages
CLOUDFLARE_PAGES_BRANCH=main

# ===== AI FEATURES (Optional - leave blank for now) =====
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# ===== GOOGLE MAPS (Future - leave blank) =====
GOOGLE_MAPS_API_KEY=

# ===== AUTHENTICATION (User Accounts + Google OAuth) =====
# JWT secret — generate a long random string: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=YOUR_LONG_RANDOM_SECRET_HERE

# Google OAuth — see "GOOGLE OAUTH SETUP" section below
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### STEP 5: Generate Railway Domain

1. Click your **app service** → **Settings** → **Networking**
2. Click **"Generate Domain"**
3. You'll get something like: `https://lunao-api.up.railway.app`
4. **Go back to Variables** and update:
   - `SITE_BASE_URL` = `https://YOUR-DOMAIN.up.railway.app`
   - `PUBLIC_API_BASE_URL` = `https://YOUR-DOMAIN.up.railway.app`

### STEP 6: Wait for Deploy + Verify

1. Watch the **Build Logs** - should see:
   ```
   npm ci --include=dev
   npm run build
   node server/index.js
   Lunao pipeline API -> http://localhost:8787
   DB -> Postgres (Railway)
   ```

2. Once deployed, test the health endpoint:
   ```
   https://YOUR-DOMAIN.up.railway.app/api/health
   ```
   Expected response:
   ```json
   {"ok":true,"mode":{"telnyx":"LIVE","cloudflare":"LIVE","siteBaseUrl":"..."}}
   ```

---

## GOOGLE OAUTH SETUP (Optional — enables "Sign in with Google")

Google OAuth lets users log in with one click instead of email + password. The email/password path works fine without it.

### STEP 1: Create a Google Cloud Project

1. Go to **https://console.cloud.google.com**
2. Click **"New Project"** → name it "Lunao"
3. Go to **APIs & Services → OAuth consent screen**
4. Choose **External** → Fill in app name, support email, developer contact
5. Click **Save and Continue** (scopes are optional for basic login)

### STEP 2: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials"** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Lunao Web App`
5. **Authorized JavaScript origins:**
   ```
   https://YOUR-DOMAIN.up.railway.app
   ```
6. **Authorized redirect URIs:**
   ```
   https://YOUR-DOMAIN.up.railway.app
   ```
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### STEP 3: Add to Railway

In your Railway service Variables, add:
```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

### STEP 4: Add to Frontend

In your local `.env` file (or Railway Variables for the build):
```
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

The Google "Sign in with Google" button will now appear in the auth modal. Without `VITE_GOOGLE_CLIENT_ID`, only email + password is shown.

---

## TELNYX WEBHOOK SETUP (CRITICAL FOR SMS)

1. Go to **https://portal.telnyx.com** → **Messaging** → **Webhooks**
2. Set **Inbound message URL** to:
   ```
   https://YOUR-DOMAIN.up.railway.app/api/webhooks/telnyx
   ```
3. Set **Outbound message status callback** to the same URL
4. Click **Save**

---

## RAILWAY RESOURCE SUMMARY

| Resource | Type | Purpose | Cost |
|----------|------|---------|------|
| **App Service** | Nixpacks (Node.js 20) | Express API + React frontend | ~$5-10/mo |
| **PostgreSQL** | Railway Postgres | All data (bookings, campaigns, SMS, credits) | ~$5-10/mo |
| **Volume** | Persistent Storage | Compiled sites survive restarts | FREE |

**Total: ~$10-20/month** (free tier covers light usage)

---

## VERIFICATION CHECKLIST

After deployment, test every feature:

### 1. Health Check
```bash
curl https://YOUR-DOMAIN.up.railway.app/api/health
```

### 2. Test SMS
```bash
curl -X POST https://YOUR-DOMAIN.up.railway.app/api/test-sms \
  -H "Content-Type: application/json" \
  -d '{"to":"+1YOUR_PHONE","text":"Hello from Railway!"}'
```

### 3. Test Campaign API
```bash
curl -X POST https://YOUR-DOMAIN.up.railway.app/api/campaign/run \
  -H "Content-Type: application/json" \
  -d '{"businesses":[{"name":"Test Salon","phone":"+1555","city":"NYC","niche":"salon"}],"niche":"salon","ownerKey":"test"}'
```

### 4. Check Credits System
```bash
curl https://YOUR-DOMAIN.up.railway.app/api/credits?ownerKey=test
```

### 5. Test Webhook (Simulate)
```bash
curl -X POST https://YOUR-DOMAIN.up.railway.app/api/webhooks/telnyx \
  -H "Content-Type: application/json" \
  -d '{"event_type":"message.delivered","payload":{"id":"test-123"}}'
```

---

## FEATURES THAT WILL WORK AFTER DEPLOYMENT

| Feature | Status | Notes |
|---------|--------|-------|
| React Dashboard | ✅ LIVE | Served from /dist |
| User Accounts | ✅ LIVE | Email/password + Google OAuth (cookie-based, cross-device) |
| Campaign Pipeline | ✅ LIVE | CSV → Site → Deploy → SMS |
| SMS (Telnyx) | ✅ LIVE | Real text messages |
| Cloudflare Deploy | ✅ LIVE | Sites go live at sms-bulk-pages.pages.dev |
| Booking System | ✅ LIVE | Customers can book appointments |
| Chatbot | ✅ LIVE | Rule-based (Gemini optional) |
| AI Code Editor | ⚠️ OPTIONAL | Add ANTHROPIC_API_KEY to enable |
| Credit System | ✅ LIVE | 4 credits per lead |
| Invite Codes | ✅ LIVE | LUNAO-XXXX-XXXX format |
| Webhook Updates | ✅ LIVE | SMS delivery receipts |
| Persistent Sites | ✅ LIVE | Volume mounts at /data |

---

## IF SOMETHING BREAKS

### App won't start?
- Check **Build Logs** - usually missing env vars
- Make sure `DATA_DIR=/data` is set (for volume mount)

### Database errors?
- Make sure PostgreSQL is linked to the app service
- Check `DATABASE_URL` is auto-injected

### SMS not sending?
- Verify `SMS_ENABLED=true`
- Verify Telnyx keys are correct
- Check Telnyx balance at portal.telnyx.com

### Sites not persisting?
- Make sure volume is mounted at `/data`
- Check `/data/sites` directory exists

---

## YOUR LIVE URLs AFTER DEPLOYMENT

```
Dashboard:     https://YOUR-DOMAIN.up.railway.app
API Base:      https://YOUR-DOMAIN.up.railway.app/api
Health:        https://YOUR-DOMAIN.up.railway.app/api/health
Deployed Sites: https://sms-bulk-pages.pages.dev/{slug}/
```

---

*Generated: 2026-06-16*
