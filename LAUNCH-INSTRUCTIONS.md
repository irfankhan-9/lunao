# LAUNCH INSTRUCTIONS — Lunao Local Development

> Give this file to **any AI agent** and it will know exactly how to start every part
> of the system, connect them together, and launch the mobile app on a real device.

---

## What This Project Is

Lunao is a local-business website builder + mobile owner app.

| Piece | Location | What it does |
|---|---|---|
| **Backend API** | `server/index.js` (this folder) | Express server on **port 8787** — SQLite DB, pipeline, bookings, chat, site hosting |
| **Frontend Web** | `src/` + `vite.config.ts` (this folder) | Vite dev server on **port 3000** — the Lunao dashboard / editor |
| **Expo App** | `C:\Users\Sunrise Computers\Downloads\lunaoexpoapp` | React Native (Expo) — the business-owner mobile companion |

---

## Prerequisites

- **Node.js** ≥ 18 (with npm)
- **Your phone** on the **same Wi-Fi** as your PC (needed for the Expo app to reach the backend)

---

## Machine Info (YOUR values — do not change)

```
LAN IP : 192.168.100.18
LAN subnet : 192.168.100.x   (all devices must be on this subnet)
Backend URL (LAN) : http://192.168.100.18:8787
Backend URL (localhost) : http://localhost:8787
Web dev server : http://localhost:3000
```

---

## Step-by-Step Launch Sequence

### 0 — First-time setup (do once)

```powershell
# From this folder (remix_-remix_-localsite):
npm install          # installs web + server deps (takes ~30 s first time)
```

### 1 — Start Backend + Web Frontend (together)

```powershell
# From this folder:
npm run dev:all
```

This runs `concurrently` which starts **both**:

| Process | URL | Command under the hood |
|---|---|---|
| Vite web dev server | http://localhost:3000 | `npm run dev` |
| Express API server | http://localhost:8787 | `npm run server` |

**Vite proxies `/api` and `/sites` to the backend** (see `vite.config.ts`), so the
web dashboard talks to the API through the proxy automatically.

**CORS is wide-open** (`Access-Control-Allow-Origin: *`) so the Expo app can call the
API directly from the phone over LAN.

**Verify it's running:**

```powershell
# In a new terminal (or use curl):
Invoke-RestMethod http://localhost:8787/api/health
# Expected: { "ok": true, "mode": "..." }
```

### 2 — Start the Expo App (separate Cursor window)

Open a **second** Cursor window, `cd` into the Expo folder, then run:

```powershell
cd "C:\Users\Sunrise Computers\Downloads\lunaoexpoapp"
npm install          # skip if node_modules already exists
npx expo start
```

Then either:

- **Press `l`** in the terminal to open the LAN URL, **or**
- **Scan the QR code** with your phone (iOS: Camera app → scan; Android: Expo Go app → Scan QR)

### 3 — Set the Expo env var

Before running `npx expo start`, make sure `.env` exists in the Expo folder:

```powershell
cd "C:\Users\Sunrise Computers\Downloads\lunaoexpoapp"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

The `.env` must contain **exactly this** (for LAN testing):

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.100.18:8787
```

> The Expo app reads this **one** env var. Every API call goes to
> `http://192.168.100.18:8787` directly — **no proxy**.

---

## Architecture / How Everything Communicates

```
┌──────────────────────────────────────────────────────────────────────┐
│  YOUR MACHINE (192.168.100.18)                                      │
│                                                                      │
│   ┌──────────────────┐        ┌────────────────────┐                │
│   │  Express API     │◄───────►│  Vite dev server   │                │
│   │  Port: 8787      │  proxy  │  Port: 3000        │                │
│   │  ←SQLite DB→     │  /api   │                    │                │
│   └──────────────────┘  /sites └────────────────────┘                │
│                          (both started by `npm run dev:all`)         │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐     │
│   │  Expo Dev Server (Metro bundler)                            │     │
│   │  Started in second Cursor window → `npx expo start`        │     │
│   │  Serves JS bundle + QR code                                 │     │
│   └────────────────────────────────────────────────────────────┘     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                      SAME Wi-Fi (192.168.100.x)
                           │
              ┌────────────▼────────────────┐
              │  YOUR PHONE                 │
              │  (Expo Go app installed)    │
              │                              │
              │  App bundle ← Metro (QR)    │
              │  API calls ────────────────►│
              │  http://192.168.100.18:8787 │
              └─────────────────────────────┘
```

| Who calls what | URL used | Why |
|---|---|---|
| Web dashboard → Backend | `http://localhost:8787` (via Vite proxy `/api`, `/sites`) | Same machine, Vite forwards |
| Expo app → Backend | `http://192.168.100.18:8787` (direct LAN) | Phone can't reach localhost; needs LAN IP |
| Phone → Expo Metro | QR scan or `exp://192.168.100.18:8081` | Expo Go connects to Metro bundler |

---

## Quick-Reference Commands

```powershell
# ── Window 1 (main project) ──────────────────────────────────────────────
cd "C:\Users\Sunrise Computers\Downloads\remix_-remix_-localsite"
npm install          # first time only
npm run dev:all      # starts backend + web frontend together

# ── Window 2 (Expo app) ──────────────────────────────────────────────────
cd "C:\Users\Sunrise Computers\Downloads\lunaoexpoapp"
npm install          # first time only
npx expo start       # shows QR code → scan with Expo Go

# ── Verify ────────────────────────────────────────────────────────────────
Invoke-RestMethod http://localhost:8787/api/health
# → { "ok": true, "mode": "..." }
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 8787 already in use | `netstat -ano \| findstr :8787` then kill the PID |
| Expo can't reach API from phone | Make sure phone and PC are on the **same Wi-Fi**; check firewall isn't blocking 8787 |
| QR code won't scan | Press `l` in the Expo terminal to open the LAN URL in browser, then enter that URL manually in Expo Go |
| `npm run dev:all` fails | Run `npm run dev` and `npm run server` in **separate** terminals instead |
| CORS errors from phone | Shouldn't happen — CORS is open (`*`). Check firewall on port 8787 |

---

## Files This Agent Must NOT Touch

Per project rules, these raw templates are **read-only**:

```
public/templates-raw/barber-template.html
public/templates-raw/barber-template-02.html
public/templates-raw/salon-template-01.html
public/templates-raw/dentist-template-01.html
public/templates-raw/hvac-template-01.html
public/templates-raw/gym-template-01.html
public/templates-raw/realestate-template-01.html
public/templates-raw/roofing-template-01.html
```
