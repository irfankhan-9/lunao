# Lunao Production Reliability Audit & Implementation Plan (Verified Revision)
**Document Version:** 2.0.0 (Post-Verification Review)  
**Target System:** Lunao Multi-Tenant Booking & Public Widget Infrastructure  
**Auditor:** Principal Backend Architect, Database Reliability Engineer & Production SRE  
**Verification Date:** 2026-10-16  
**Status:** Audit Complete & Verified — No Code or Production Database Modifications Executed  

---

## 1. Executive Summary

This revised document presents an evidence-backed verification of the booking failure reported on deployed Lunao websites (e.g., `https://lunao-web-designn.pages.dev`). Every claimed defect has been tested against the codebase, configuration, and live runtime behavior.

### Key Verified Discoveries
1. **The Root Cause of the Browser CORS Preflight Redirect Failure is CONFIRMED with Live Runtime Evidence:**  
   The deployed frontend template (`public/templates-raw/hvac-template-01.html`, line 2726) hardcoded an ephemeral Google AI Studio development preview URL (`https://ais-dev-44ecmg4ogrs7odr4w6f2gm-664492402886.asia-southeast1.run.app`). When an external browser hits this development environment with an `OPTIONS` preflight request, the Google Frontend / AI Studio auth proxy intercepts the request and responds with **`HTTP/2 302 Found`** pointing to `/__cookie_check.html`. Per the W3C CORS specification, browsers reject any preflight request that results in a redirect, triggering `net::ERR_FAILED` and `TypeError: Failed to fetch`.
2. **False Success on Failed Persistence is CONFIRMED in Code:**  
   In `/server/lib/bookings.js` (lines 81–92), if Supabase fails or times out, the error is swallowed and the local SQLite booking object is returned. The HTTP endpoint `/api/public/bookings` then returns `HTTP 200` with `ok: true`. On ephemeral Cloud Run containers, local disk is wiped upon restart, and instances do not share state, resulting in silent, permanent booking loss.
3. **Concurrent Duplicate Inserts are CONFIRMED in the Database:**  
   Inspection of the live Supabase database revealed existing duplicate records with identical millisecond timestamps (e.g., rows 7 and 8 with `created_at: 1792145081169`). This was traced to `/server/lib/bookings.js` lines 74 and 84, where `supabaseInsertBooking()` is invoked twice for every booking: once as an unawaited background promise and once with `await`.
4. **Severe Unauthenticated PII Exposure is CONFIRMED in Code:**  
   `/server/index.js` (line 813) exposes `GET /api/public/bookings?slug=...` without authentication, leaking customer names, phone numbers, emails, and booking notes to anyone with a tenant slug.

---

## 2. Evidence-Based Defect Classification

Every finding is categorized under one of three strict evidentiary standards:
- **`[CONFIRMED]`**: Proven by code inspection, configuration analysis, or direct runtime execution.
- **`[PLAUSIBLE BUT UNVERIFIED]`**: Architecturally sound and likely, but lacking runtime logs or live infrastructure inspection.
- **`[NOT SUPPORTED BY EVIDENCE]`**: Refuted by runtime testing or codebase inspection.

---

### Finding 1: CORS Preflight 302 Redirection
**Classification: `[CONFIRMED]`**  
**Locations:**
- `public/templates-raw/hvac-template-01.html` (Lines 2725–2727)
- `public/hvac-template-01.html` (Lines 2725–2727)
- `dist/hvac-template-01.html` (Lines 2725–2727)
- `server/index.js` (Lines 189–197)

**Runtime Evidence:**
Direct `curl` execution against the reported endpoint:
```bash
curl -s -i -X OPTIONS "https://ais-dev-44ecmg4ogrs7odr4w6f2gm-664492402886.asia-southeast1.run.app/api/public/bookings" \
  -H "Origin: https://lunao-web-designn.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```
Response:
```http
HTTP/2 302
server: Google Frontend
set-cookie: __SECURE-aistudio_auth_flow_may_set_cookies=true; Path=/; Secure; SameSite=None; Domain=ais-dev-...; Partitioned; Max-Age=60;
location: /__cookie_check.html?return_url=https%3A%2F%2Fais-dev-44ecmg4ogrs7odr4w6f2gm-664492402886.asia-southeast1.run.app%2Fapi%2Fpublic%2Fbookings
content-length: 200
```
**Code Analysis:**
- Express itself is **NOT** responsible for the redirect. When tested locally (`http://localhost:3000/api/public/bookings`), Express responds immediately with `HTTP/1.1 204 No Content` and `Access-Control-Allow-Origin: *`.
- The redirect is introduced entirely by Google Cloud Frontend / AI Studio access control protecting the private development domain `ais-dev-*`.
- The template code hardcoded this development domain:
  ```javascript
  const apiBase = window.location.origin.includes('pages.dev') || window.location.origin.includes('lunao.app') 
    ? 'https://ais-dev-44ecmg4ogrs7odr4w6f2gm-664492402886.asia-southeast1.run.app' 
    : window.location.origin;
  ```
- Because redirects are forbidden on CORS preflight requests by the W3C Fetch specification, the browser aborts with `net::ERR_FAILED`.

---

### Finding 2: False Positive Success on Failed Persistence
**Classification: `[CONFIRMED]`**  
**Locations:**
- `server/index.js` (Lines 803–810)
- `server/lib/bookings.js` (Lines 81–92)
- `server/lib/supabase.js` (Lines 56–131)

**Code Analysis:**
1. In `server/index.js`:
   ```javascript
   app.post(['/api/bookings', '/api/public/bookings'], async (req, res) => {
     try {
       const booking = await createBookingAsync(req.body || {});
       res.json({ ok: true, id: booking.id, booking });
     } catch (err) {
       res.status(err.status || 500).json({ ok: false, error: err.message });
     }
   });
   ```
2. In `server/lib/bookings.js`:
   ```javascript
   export async function createBookingAsync(input = {}) {
     const localBooking = createBooking(input);
     try {
       const sbData = await supabaseInsertBooking(localBooking);
       if (sbData) {
         return { ...localBooking, supabaseId: sbData.id };
       }
     } catch (err) {
       console.warn('[bookings] Supabase insert warning:', err.message);
     }
     return localBooking; // <--- Returns localBooking even if Supabase returns null or throws!
   }
   ```
3. If Supabase fails (due to timeout, connection failure, or credentials issue), `supabaseInsertBooking` returns `null` or throws an error caught at line 89.
4. `createBookingAsync` returns `localBooking`.
5. `server/index.js` executes `res.json({ ok: true, id: booking.id, booking })`.
6. The client receives `200 OK` with `ok: true`, falsely believing the booking is saved, while on Cloud Run the ephemeral local SQLite database is discarded on container recycle.

---

### Finding 3: Database Write Path Disconnect & Double-Insert Defect
**Classification: `[CONFIRMED]`**  
**Locations:**
- `server/lib/bookings.js` (Lines 74, 84)
- `server/lib/supabase.js` (Lines 6–20, 56–131)
- `scripts/supabase-migration.sql` (Lines 28–43)

**Evidence & Trace:**
1. A single request executes **both** of the following:
   - Line 74: `supabaseInsertBooking(localBooking).catch(...)` (fire-and-forget inside `createBooking`)
   - Line 84: `await supabaseInsertBooking(localBooking)` (awaited inside `createBookingAsync`)
2. Live Supabase database query confirmed duplicate rows created simultaneously:
   - Row ID 7: `slug: "hvac-artisan-lounge-austin"`, `created_at: 1792145081169`
   - Row ID 8: `slug: "hvac-artisan-lounge-austin"`, `created_at: 1792145081169`
3. Write path hierarchy:
   - **Step 1:** Writes to local SQLite `insertStmt.run(record)` (in-memory mock in AI Studio, local file on Railway).
   - **Step 2:** Direct Postgres connection via `pgPool` using connection string `aws-0-us-east-1.pooler.supabase.com:6543`.
   - **Step 3:** HTTP fallback via `@supabase/supabase-js` client (`sb.from('bookings').insert()`) with a 1500ms timeout (`withTimeout`).
   - If Step 2 and Step 3 fail, the server returns the local SQLite record as a successful booking.

---

### Finding 4: Client-Side Silent Error Masking
**Classification: `[CONFIRMED]`**  
**Locations:**
- `public/templates-raw/hvac-template-01.html` (Lines 2746–2751)
- `lunaoownerpwa/src/services/tenantDataService.ts` (Lines 52–77)

**Code Analysis:**
- In `hvac-template-01.html`:
  ```javascript
  try {
    await fetch(`${apiBase}/api/public/bookings`, { ... });
  } catch (err) {
    console.warn('Booking sync warning:', err);
  }
  // Animate interface states (runs regardless of catch!)
  ```
  Even when the fetch fails, the catch block catches the error, logs it as a warning, and immediately proceeds to animate the success confirmation and clear the form.
- In Owner PWA `tenantDataService.ts`:
  A 1200ms timeout aborts requests and silently returns `INITIAL_BOOKINGS` mock data ("Alex Rivera", "Marcus Vance"), masking backend network delays or outages from the business owner.

---

### Finding 5: Public PII Leak via Unauthenticated GET Endpoint
**Classification: `[CONFIRMED]`**  
**Location:**
- `server/index.js` (Lines 812–821)

**Code Analysis:**
```javascript
app.get(['/api/bookings', '/api/public/bookings'], async (req, res) => {
  try {
    const slug = typeof req.query.slug === 'string' && req.query.slug ? req.query.slug : null;
    const bookings = await listBookingsAsync(slug);
    res.json({ ok: true, bookings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
```
This endpoint has zero authentication or session check. Any user on the internet can send `GET /api/public/bookings?slug=target-business` and receive all customer names, phone numbers, emails, and booking notes.

---

### Finding 6: Upstream Trailing-Slash Redirect Hypothesis
**Classification: `[NOT SUPPORTED BY EVIDENCE]`**  
**Hypothesis from Initial Audit:**
It was hypothesized that Cloud Run or Nginx was issuing a 301/307 redirect due to missing trailing slashes (e.g., `/api/public/bookings` -> `/api/public/bookings/`).  
**Evidence:**
Live testing with curl proved the 302 response redirects to `/__cookie_check.html?return_url=...`, not to a slash-normalized URL. The redirect is 100% due to the AI Studio authentication wall on `ais-dev-*`, not URL normalization.

---

### Finding 7: Supabase TCP Blocked by Container Egress
**Classification: `[NOT SUPPORTED BY EVIDENCE]`**  
**Hypothesis from Initial Audit:**
It was assumed direct TCP on port 6543 to AWS Supabase pooler was blocked by container network policy.  
**Evidence:**
Direct Node.js socket test verified:
`TCP CONNECTED TO SUPABASE POOLER! aws-0-us-east-1.pooler.supabase.com:6543`  
Read-only query verified:
`Postgres Auth SUCCESS! Bookings count in Supabase: 9`  
Direct TCP is functional. The failure to persist was driven by the browser never reaching the backend due to preflight rejection and hardcoded dev URLs.

---

### Finding 8: Supabase Row Level Security (RLS) Blocking Writes
**Classification: `[NOT SUPPORTED BY EVIDENCE]`**  
**Evidence:**
Live database catalog query executed:
`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'bookings'`  
Returned:
`relrowsecurity: false, relforcerowsecurity: false`  
Policies returned: `[]`.  
RLS is currently disabled on the `bookings` table.

---

## 3. Verified Data Flow: Before vs. Target Architecture

### Current Broken Data Flow
```
[Client Browser on pages.dev]
       │
       ├──► (Preflight OPTIONS to hardcoded https://ais-dev-.../api/public/bookings)
       │          │
       │          ▼ [Google Frontend Intercept]
       │     302 Found -> /__cookie_check.html
       │          │
       │          ▼
       └──► [Browser rejects: Redirect is not allowed for preflight]
                  │
                  ▼
            [catch (err) { console.warn(...) }] -> Shows Success Chime (Data Lost)
```

### Target Resilient Data Flow
```
[Client Browser on Deployed Site (Custom Domain / Cloudflare Pages)]
       │
       ├──► 1. Read apiBase from window.LUNAO_API_BASE or fallback to production URL
       │
       ├──► 2. Generate UUIDv4 idempotencyKey, store in sessionStorage
       │
       ├──► 3. OPTIONS Preflight to Production API
       │          │
       │          ▼ [Express CORS Middleware]
       │     204 No Content (Access-Control-Allow-Origin: <validated-origin>)
       │
       ├──► 4. POST /api/public/bookings { idempotencyKey, slug, ... }
       │          │
       │          ▼ [Express Router]
       │     Validate Payload (slug, phone/name, idempotencyKey)
       │          │
       │          ▼ [Database Transaction]
       │     Check existing idempotencyKey -> if exists, return existing row (200 OK)
       │     Insert into Supabase bookings table synchronously
       │          │
       │          ├──► [Success]: Return 201 Created { ok: true, id, booking }
       │          │
       │          └──► [Failure/Timeout]: Return 503 Service Unavailable { ok: false }
       │                                     (Client shows retry banner; no false success)
       │
[Owner PWA / Dashboard]
       │
       ├──► Authenticated GET /api/pwa/:slug/bookings (Bearer token required)
       │          │
       │          ▼
       │     Direct query to Supabase (authoritative source of truth)
       │     PWA displays real data; error banner if unreachable (no silent mock fallback)
```

---

## 4. Detailed Component Reliability & Security Architecture

### A. Durable Primary Persistence (Supabase / Postgres)
- **Eliminate Dual Sync:** Remove the unawaited background promise in `createBooking()`.
- **Synchronous Await:** `createBookingAsync` must execute a single database transaction against Supabase Postgres.
- **Strict Response Semantics:**
  - Database commit confirmed -> return `HTTP 201 Created` with booking payload.
  - Database unavailable / timed out -> return `HTTP 503 Service Unavailable`.
  - Never return `200/201` based solely on in-memory or ephemeral local SQLite state.

### B. Stable Idempotent Submissions
- Every booking request from the client widget must include an `idempotency_key` (UUID v4).
- The key is generated when the user clicks "Confirm Booking" and persisted in `sessionStorage` until a confirmed 201 response is received.
- If a network timeout occurs, browser auto-retry or manual user retry transmits the exact same `idempotency_key`.
- Database constraint enforces uniqueness scoped by tenant slug:
  ```sql
  ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_tenant_idempotency 
  ON bookings (slug, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
  ```
- If a record with `(slug, idempotency_key)` already exists, the server returns the existing booking with `HTTP 200 OK`, avoiding duplicate rows.

### C. Outage Handling: Synchronous Error vs. Durable Outage Queue
- **Crucial Architectural Rule:** An in-memory queue, in-memory Map, local SQLite file on ephemeral disk, or unawaited Promise **is NOT durable**. If Cloud Run restarts or scales down, uncommitted bookings are lost.
- **Recommended Outage Strategy (Phase 1):**  
  Implement strict synchronous commit with immediate rejection (`503 Service Unavailable`). On 503, the client widget retains the form inputs, highlights a "Server busy, tap to retry" button, and displays the business's direct telephone number (`tel:{{PHONE_RAW}}`). This guarantees zero silent booking loss without introducing expensive distributed systems.
- **Optional Durable Outage Queue (Phase 2):**  
  If asynchronous offline submission is mandated, incoming bookings must be written to **Google Cloud Tasks** or **Cloud Pub/Sub** before returning `202 Accepted`. Cloud Tasks provides durable storage, exponential backoff retries, and dead-letter queues (DLQ).

### D. CORS Policy & Origin Discipline
- Do not use `Access-Control-Allow-Origin: *` blindly on authenticated routes.
- **Public Endpoints (`/api/public/*`):**  
  Accept cross-origin requests from any origin (`*` or reflected origin), but **never allow credentials** (`Allow-Credentials: false`). Allowed methods: `POST, OPTIONS`.
- **Private Endpoints (`/api/pwa/*`, `/api/*`):**  
  Validate origin against an explicit whitelist (`https://lunao.app`, `https://*.pages.dev`, `http://localhost:3000`). If credentials (`cookies`, `Authorization`) are used, reflect the matched origin. Reject untrusted origins with `403 Forbidden`.

### E. Tenant Isolation & PII Protection
- **Remove Public Read:** Eliminate `GET /api/public/bookings` entirely. Public website visitors have no legitimate reason to query all historical bookings for a tenant.
- **Authenticated PWA Reads:** All booking queries must route through `/api/pwa/:slug/bookings`, guarded by `pwaAuth` and `assertSameSlug`.
- **Tenant Validation on Write:** On `POST /api/public/bookings`, verify that `slug` exists in `business_profiles` or compiled sites catalog before accepting bookings.

---

## 5. Verified Database Migration

The migration has been tested against the live Supabase catalog for compatibility.

```sql
-- Migration: 20261016_bookings_idempotency.sql
-- Description: Add idempotency_key and performance indices to bookings table
-- Compatibility: 100% non-breaking; existing rows have idempotency_key = NULL

-- 1. Add column if missing
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2. Create partial unique index (prevents duplicate submissions per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_tenant_idempotency 
ON bookings (slug, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 3. Composite index for rapid query by tenant and status
CREATE INDEX IF NOT EXISTS idx_bookings_slug_status_created 
ON bookings (slug, status, created_at DESC);
```

---

## 6. Implementation Action Plan (Prioritized Phases)

### Phase P0: Eliminate Critical Loss Vectors (Immediate)
1. **Fix Template API Base URL:**  
   Replace hardcoded `ais-dev-...` in `public/templates-raw/hvac-template-01.html` (and all derived templates in `/public/`) with dynamic resolution:
   `window.LUNAO_API_BASE || '{{API_BASE_URL}}'` or relative origin.
2. **Synchronous Durable Supabase Writes:**  
   Refactor `createBookingAsync` in `server/lib/bookings.js`:
   - Remove fire-and-forget background promise.
   - Await Supabase insert.
   - If Supabase fails, throw a 503 error; do not return local uncommitted state.
3. **Frontend Error Handling:**  
   In `hvac-template-01.html`, catch block must display a clear failure/retry state and direct phone call option if `fetch` fails; never play success sound on failure.
4. **Remove Public PII Exposure:**  
   Remove `GET` handler from `/api/public/bookings` in `server/index.js`.

### Phase P1: Idempotency & Database Hardening
1. Execute migration `idx_bookings_tenant_idempotency` in Supabase.
2. Pass client-generated `idempotencyKey` in booking widget submissions.
3. Implement `ON CONFLICT (slug, idempotency_key) DO NOTHING` or duplicate lookup in `server/lib/supabase.js`.

### Phase P2: Owner PWA Consistency & Observability
1. Remove 1200ms silent mock fallback in `lunaoownerpwa/src/services/tenantDataService.ts`. Show an explicit offline/reconnecting indicator when backend requests fail.
2. Add structured request logging with `reqId`, `slug`, and `idempotencyKey`.

---

## 7. Concrete Test Matrix & Acceptance Criteria

| Test ID | Test Description | Execution Method | Acceptance Criteria |
|---|---|---|---|
| **TC-01** | CORS Preflight on Public API | `curl -X OPTIONS https://<prod-api>/api/public/bookings -H "Origin: https://lunao-web-designn.pages.dev"` | Response is `204 No Content` with `Access-Control-Allow-Origin`. **Zero 301/302/307 redirects.** |
| **TC-02** | Confirmed Supabase Write | Submit booking via widget with valid payload. Query Supabase directly via SQL. | Booking row exists in Supabase with matching `slug`, `phone`, and `idempotency_key`. |
| **TC-03** | No False Positive on DB Outage | Simulate DB outage (invalid connection string). POST to `/api/public/bookings`. | Server returns `503 Service Unavailable`. Client UI displays error banner and retry option. **No success sound plays.** |
| **TC-04** | Idempotent Retry | Send two identical POST requests with the same `(slug, idempotencyKey)`. | First returns `201 Created`. Second returns `200 OK`. Database contains **exactly 1 row**. |
| **TC-05** | Public PII Protection | `GET /api/public/bookings?slug=smit-hvac-hub-austin` without credentials. | Server returns `404 Not Found` or `405 Method Not Allowed`. **Zero customer records returned.** |
| **TC-06** | Owner PWA Isolation | Authenticate PWA as Tenant A. Query `/api/pwa/tenant-b/bookings`. | Server returns `403 Forbidden`. |
| **TC-07** | Owner PWA Outage State | Disconnect network on Owner PWA. | UI displays "Offline / Connection Lost" banner. **Does not silently display mock bookings.** |

---

## 8. Guardrails: Forbidden Actions Without Prior Approval
- **DO NOT** delete or overwrite raw template master files in `/public/templates-raw/` without backing them up.
- **DO NOT** introduce wildcard CORS (`*`) on endpoints that accept or set cookies or Authorization headers.
- **DO NOT** use in-memory buffers or local disk files as a substitute for durable database commits.
- **DO NOT** drop, recreate, or truncate existing database tables.
- **DO NOT** expose Supabase service role keys or database passwords to client-side code.
