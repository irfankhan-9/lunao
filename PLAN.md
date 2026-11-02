# Lunao — V2 Plan (post-deploy fixes)

> For `irfankhan776/lunaosite.git`. This plan locks in 4 high-impact fixes
> before the next push: **password wall replaces full auth**, **no more
> auto-reply / fake delivery in Messages**, **reliable delivery confirmation
> via polling**, **session cookies never expire during normal use**.

---

## 0. What's wrong today (verified in code)

| Bug | File | Evidence |
|---|---|---|
| Outgoing SMS triggers a fabricated "incoming" reply 2.5 s later | `src/components/Messages.tsx` | `setTimeout(() => { ... type: 'incoming' }, 2500)` |
| Sent / Delivered / Received buttons are fake — they mutate local React state only, never call any API | `src/components/Messages.tsx` | `toggleStatusDirect(bizId, type)` only calls `setBusinesses` |
| `smsHistory` is 100% client-state — never persisted, never reconciled with `sms_logs` / `sms_inbound` | `src/components/Messages.tsx` | `smsHistory: [...b.smsHistory, newEntry]` |
| Full email/Google/bcrypt/JWT auth is in place but unused — causes confusion and slow boot | `server/lib/auth.js`, `src/contexts/AuthContext.tsx` | Real auth wired but no UI for login/register |
| `siteGate.js` (the password wall) is fully written but **never imported into `server/index.js`** | `server/lib/siteGate.js` (untracked) | No `gateProtected()` call, no `/api/site-gate*` route, no `/site-gate` page |
| No client-side hook to poll `/api/owner/sms` after a send → delivery upgrades from Telnyx are invisible | `src/components/Messages.tsx`, `src/components/Campaigns.tsx` | `smsLogs` UI exists but no live refresh |

---

## 1. Decisions (locked from your answers)

1. **Push target** — force-push to overwrite `https://github.com/irfankhan776/lunaosite.git`
   on `master`. (Local repo is already on `master` and tracks that remote.)
2. **Auth** — **drop the full auth system** (email/password/Google/bcrypt/JWT/users table).
   Replace with a single **hardcoded password wall**: `$Khan1234455`.
3. **Messages** — **strip all simulation / auto-reply / fake state** from the
   client. Messages tab will read **only** from the real DB via `/api/owner/sms`
   and `/api/owner/inbound`, hydrated from Telnyx webhooks. Empty state shown
   until real data lands.
4. **Delivery confirmation** — **4-second polling loop** re-queries
   `/api/owner/sms` after every send, stops when status flips to
   `delivered` / `failed` (or after 60 s timeout).

---

## 2. Code changes — exact file list

### 2.1 Server: password wall (reuse what you already wrote)

You already wrote `server/lib/siteGate.js`. Three changes needed in
`server/index.js`:

- Import `siteGate` and the routes/handlers from it.
- Mount `GET  /site-gate` (static HTML page served from `public/`)
- Mount `POST /api/site-gate`, `POST /api/site-gate/logout`,
  `GET /api/site-gate/status`
- Apply `gateProtected(['/dashboard', '/sites', '/templates', '/messages', '/campaigns', '/credits', '/bookings'])` **before** the static-file / SPA fallback, but **after** `/api/webhooks/*`, `/api/health`, and `/api/site-gate*`.

I'll also add a tiny `public/site-gate.html` page (dark theme, branded "Lunao",
single password input, shake on wrong password, 15-min lockout message).

### 2.2 Server: precompute the bcrypt hash for `$Khan1234455`

- Compute the hash once (cost 12) and bake it as a fallback **constant** in
  `siteGate.js`'s `getGateHash()` — so the gate works even before Railway env
  vars are set. Real prod can override via `SITE_GATE_PASSWORD_HASH`.
- Failure mode: if `SITE_GATE_PASSWORD_HASH` env is set, it always wins.

### 2.3 Server: strip real auth

- `server/lib/auth.js` — delete (move to `server/lib/_archive_auth.js` for
  history).
- All `/api/auth/*` routes — delete from `server/index.js`.
- `users` table — drop from schema init (keep migrations safe).
- `authenticate` middleware on `/api/owner/sms` — switch to `gateProtected`
  so it requires the gate cookie (no JWT).

### 2.4 Client: strip real auth UI

- `src/contexts/AuthContext.tsx` — replace with a 20-line `GateContext.tsx`
  that just calls `/api/site-gate/status` once and exposes
  `{ unlocked, unlock(password) }`. Cookie set by the server = persistent
  login (12 h TTL, refreshed on each successful unlock).
- Anywhere `useAuth()` is called — switch to `useGate()` (one find-and-replace).
- `src/lib/pipelineClient.ts` — drop the `auth.*` helpers, keep `owner.sms`,
  `owner.inbound`, `siteGate.*`.

### 2.5 Client: strip simulation from Messages

`src/components/Messages.tsx`:

- **Delete** the entire `handleSendMessage`'s `setTimeout(..., 2500)` block
  (lines ~145–174 — the fake auto-reply).
- **Delete** `toggleStatusDirect()` and the "Sent / Delivered / Received"
  toggle buttons in the list (no more fake status flips).
- **Replace** `smsHistory` with **server data only**: `useOwnerSms(ownerKey)`
  hook that calls `/api/owner/sms?ownerKey=<key>` on mount + on every campaign
  completion event.
- **Replace** local "No messages yet" empty state with the real one (DB is
  empty until SMS is sent and webhook lands).
- **Show real delivery ticks** from the API: each row already has
  `status: 'queued' | 'sent' | 'delivered' | 'failed'` → render the same
  `renderDeliveryTick()` you already have.
- **Send button** now actually POSTs to a new endpoint `POST /api/owner/sms`
  (one-off manual SMS from the dashboard) that creates an `sms_logs` row
  with `status: 'queued'` and dispatches via `sendSms()` from `telnyx.js`.
  Refunds the 3 credits on failure (same logic the campaign runner uses).

### 2.6 Client: delivery polling loop

New hook `useOwnerSmsPolling(ownerKey, smsId, opts)`:

- Fires immediately, then every **4 s** while at least one row is `queued`
  or `sent` and < 60 s elapsed.
- Stops when: every watched row is terminal (`delivered` / `failed`), or
  timeout.
- Calls `GET /api/owner/sms?ownerKey=<key>` (existing endpoint, returns the
  full list — we diff by `id`).
- Exposes `{ sms, isPolling, lastPolledAt, forceRefresh }`.

`Campaigns.tsx`: when the SSE stream emits `sms:sent`, immediately
`forceRefresh()` the sms hook. UI flips the tick from "Sent (single grey)" to
"Delivered (double blue)" within 4 s of the Telnyx webhook landing.

### 2.7 Docs

- `CONTEXT.md`, `PROJECT_CONTEXT.md` — remove the "real auth" sections,
  replace with "password gate" section. Keep the API surface intact
  (everything still works — just no JWT, gate cookie is enough).
- `RAILWAY-FINAL-DEPLOY.md` — add **one** new required env var:
  - `SITE_GATE_JWT_SECRET` (any 64-char random string; I'll generate one
    and put it in `.env.example`). If unset, the gate **fails closed**
    (locked site) — that's intentional.

---

## 3. What stays the same

- `/public/templates-raw/` (8 pristine templates) — 100% untouched.
- `/public/filename.html` and `/filename.html` live previews — untouched.
- All 8 niche templates, placeholder manifest, compilation pipeline.
- Telnyx webhook handler — unchanged. Delivery upgrades still flow.
- Cloudflare Pages deploy — unchanged.
- Owner App (Expo, `lunaoexpoapp/`) — outside the scope of this push. (Its
  `/api/owner/redeem` falls into dev mode today and will continue to.)

---

## 4. New env vars (Railway)

| Var | Required | Purpose |
|---|---|---|
| `SITE_GATE_JWT_SECRET` | **Yes** | Signs the gate cookie. Any 64-char random string. If missing, site locks itself. |
| `SITE_GATE_PASSWORD_HASH` | Optional | Override the baked-in hash. If set, wins over the fallback. |

Everything else from `RAILWAY_DEPLOY.md` stays. The list shortens by a few
vars (no more JWT_SECRET, bcrypt cost, Google OAuth, etc.).

---

## 5. Deploy order (you already deployed once, this is the re-deploy)

```
[ ] 1.  Read this plan (you are here)
[ ] 2.  Approve + let me write the code
[ ] 3.  I'll commit + force-push to https://github.com/irfankhan776/lunaosite.git
[ ] 4.  On Railway → your lunao service → Variables → set SITE_GATE_JWT_SECRET
       (I'll generate and paste the value for you)
[ ] 5.  Railway auto-redeploys (GitHub integration already wired)
[ ] 6.  Open https://<your-app>.up.railway.app → enter password $Khan1234455
[ ] 7.  Open Messages → send a test SMS to your phone → watch the tick flip
       to "Delivered" within 4–10 s of your phone buzzing
```

---

## 6. Risk + rollback

- **Risk:** force-push to `irfankhan776/lunaosite.git` rewrites the public
  history visible on GitHub. The remote currently has ~18 commits of mostly
  docs (not the real code), so nothing of value is lost — but it's
  irreversible from your end without a reflog restore.
- **Rollback:** Railway can roll back to the previous deploy with one click
  (its built-in image history). The git history rollback would need
  `git push --force origin <previous-sha>:master` from a clone with the
  pre-push reflog — say the word and I'll keep a `pre-v2` tag locally before
  the push.

---

*Generated: 2026-06-17*
*Plan: Lunao v2 (password wall + real messages + delivery polling)*
