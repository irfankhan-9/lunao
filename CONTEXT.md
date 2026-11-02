# Lunao Owner App — Full Project Context

> Give this file to any coding agent working on this codebase. It covers what the app is, how it's structured, every public API surface, the design system, and the rules that keep it stable.

---

## 1. What Is Lunao?

**Lunao** is a SaaS that mass-produces personalized websites for local businesses (barbers, dentists, gyms, HVAC, roofers, real estate agents, salons) and deploys them to Cloudflare Pages.

There are two products:

| Product | Stack | Role |
|---------|-------|------|
| **Lunao Backend** | Express + SQLite (→ Postgres on Railway) | Generates site HTML, runs the AI chatbot, stores bookings, deploys to Cloudflare Pages |
| **Lunao Owner App** | Expo SDK 54 / React Native 0.81 / React 19 / TypeScript | Mobile companion for the business owner — see bookings, read chatbot conversations, edit their live site, deploy with one tap |

This repo is the **Owner App only**. The backend is a separate project.

---

## 2. Who Uses This App?

A single local business owner. They receive a one-time invite code (`LUNAO-XXXX-XXXX`) from the Lunao platform. After redeeming it, the app is permanently scoped to their one business (identified by `slug`).

The owner never sees any other business's data. Every API request carries an `Authorization: Bearer <token>` header and is implicitly scoped to their `slug`.

---

## 3. The 5 Core Screens

### 3.1 Login (`app/login.tsx`)
- Single invite-code entry with a 4-segment visual input (`LUNAO-XXXX-XXXX`)
- Shake animation on invalid code
- On success, stores the session and redirects to the home tab
- If the `/api/owner/redeem` endpoint doesn't exist yet, the app **automatically enters dev mode** (see §9)

### 3.2 Home Dashboard (`app/(tabs)/home.tsx`)
- Four stat cards: today's bookings, unactioned bookings, conversation count, last deploy time
- Recent activity feed
- Quick-action buttons (Call, Text, View Site, New Booking)
- Uses React Query hooks from `lib/queries.ts`

### 3.3 Bookings (`app/(tabs)/bookings.tsx` + `app/booking/[id].tsx`)
- Filter chips: All / New / Confirmed / Cancelled
- Each row shows customer name, service, date/time, and a source badge (Form or Chatbot)
- Tapping a row opens a card-presented detail screen with:
  - Confirm / Cancel buttons (PATCH to API, optimistic update)
  - Call and Text deep-link buttons
  - Full booking info card

### 3.4 Chats (`app/(tabs)/chats.tsx` + `app/chat/[id].tsx`)
- List of conversation sessions with last message preview, timestamp, and a "booked" badge if that session produced a booking
- Empty state shown when the conversations endpoint isn't built yet (graceful degradation)
- Detail screen renders full chat transcript (user/assistant bubbles with timestamps)
- Shows a booking banner at the top if the conversation led to a booking

### 3.5 Editor (`app/(tabs)/editor.tsx`)
- `react-native-webview` loads the live site at the owner's Cloudflare Pages URL
- A JavaScript bridge injected into the WebView lets the owner **tap any image or text** to edit it
- Image editing: pick from photo library, pick from camera, or paste an image URL
- Text editing: bottom sheet with a text input, font size slider, color picker
- **Save** writes HTML back to the API (PUT)
- **Deploy** triggers a Cloudflare Pages deployment (POST)
- Post-deploy celebration screen with a copyable deploy URL

### 3.6 Settings (`app/(tabs)/settings.tsx`)
- Business name and site URL (tap to open in browser)
- Notification permission toggle
- Sound toggle (master mute for all haptics + audio)
- Theme mode: System / Light / Dark
- Niche selector (changes the entire app's brand identity)
- Reduce-motion toggle
- Sign out button (clears SecureStore, redirects to login)

---

## 4. Data Models

All types live in `lib/types.ts`. Mirror these exactly — the backend sends and receives these shapes.

```typescript
// Booking statuses
type BookingStatus = "new" | "confirmed" | "cancelled";

// Where the booking came from
type BookingSource = "form" | "chatbot";

// A single booking
interface Booking {
  id: number;              // auto-increment PK
  slug: string;            // owner's business slug
  businessName: string;
  customerName: string;
  phone: string;
  email: string;
  service: string;
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM
  notes: string;
  source: BookingSource;
  status: BookingStatus;
  createdAt: number;       // epoch ms
}

// A deployed site
interface Site {
  slug: string;
  title: string;
  niche: string;           // e.g. "Barber", "Dentist"
  url: string;             // Cloudflare Pages URL
  updatedAt: number | null;
}

// Owner profile (stored in SecureStore after login)
interface OwnerProfile {
  slug: string;
  businessName: string;
  niche: string;
  siteUrl: string;
}

// A chatbot conversation session
interface Conversation {
  id: string;
  slug: string;
  createdAt: number;
  lastMessage: string;
  lastRole: "user" | "assistant";
  messageCount: number;
  booked: boolean;         // did this session produce a booking?
}

// A single chat message
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

// Chat session (for detail view)
interface ChatSession {
  id: string;
  slug: string;
  createdAt: number;
}

// Feature toggles on a site
interface Addons {
  booking: boolean;
  chatbot: boolean;
}
```

---

## 5. API Client (`lib/api.ts`)

**The ONLY host configuration:** `EXPO_PUBLIC_API_BASE_URL` environment variable.

All API paths are relative to this base URL. Never hardcode a host.

### Request envelope

Every response follows this shape:

```json
{ "ok": true, ...data }
```

On error:

```json
{ "ok": false, "error": "message" }
```

Or a raw non-2xx status code. The `ApiError` class distinguishes:

- `notImplemented: true` → server returned 404 (endpoint not built yet)
- `networkError: true` → request never reached the server (offline, DNS, CORS)

### Endpoint reference

| Method | Path | Purpose | Auth | Status |
|--------|------|---------|------|--------|
| GET | `/api/health` | Health check | No | Built |
| GET | `/api/sites` | List all deployed sites | Yes | Built |
| GET | `/api/sites/:slug` | Get site HTML | Yes | Built |
| PUT | `/api/sites/:slug` | Update site HTML | Yes | Built |
| POST | `/api/sites/:slug/deploy` | Deploy to Cloudflare Pages | Yes | Built |
| GET | `/api/sites/:slug/addons` | Get booking/chatbot toggles | Yes | Built |
| POST | `/api/sites/:slug/addons` | Set booking/chatbot toggles | Yes | Built |
| GET | `/api/bookings?slug=:slug` | List bookings for a site | Yes | Built |
| PATCH | `/api/bookings/:id` | Update booking status | Yes | Built |
| POST | `/api/ai/edit` | AI HTML editing (SSE stream) | Yes | Built |
| POST | `/api/owner/redeem` | Login with invite code | No | **Not built yet** |
| GET | `/api/owner/me` | Refresh owner profile | Yes | **Not built yet** |
| POST | `/api/owner/push-token` | Register Expo push token | Yes | **Not built yet** |
| GET | `/api/sites/:slug/conversations` | List chat sessions | Yes | **Not built yet** |
| GET | `/api/chat/sessions/:id` | Full chat transcript | Yes | **Not built yet** |

### SSE stream

`postSSE(path, body, onEvent)` in `lib/api.ts` handles the AI edit endpoint. It parses `text/event-stream` and calls `onEvent(eventName, parsedData)` for each chunk.

### Auth header

The API client maintains an in-memory `authToken`. Call `setAuthToken(token)` after login or `setAuthToken(null)` on sign out. Every authenticated request includes `Authorization: Bearer <token>`.

---

## 6. Authentication (`lib/auth.ts` + `lib/AuthContext.tsx`)

### v2: Site Gate (single hardcoded password)

v2 replaces the email/Google/bcrypt/JWT auth flow with a single hardcoded
password gate. The server (`server/lib/siteGate.js`) sets a signed cookie
(`lunao_site_gate`, 12-hour TTL) that gates every dashboard API + page.
There is no signup, no login, no user table. Password is `$Khan1234455`.

### Invite-code login flow (legacy — retained for the Expo Owner App only)

1. User enters a code like `LUNAO-ABCD-EFGH` on the login screen
2. Code is trimmed and uppercased
3. `api.redeem(code)` is called → `POST /api/owner/redeem`
4. On success, the server returns `{ token, slug, businessName, niche, siteUrl }`
5. Session is persisted to `expo-secure-store` under keys `lunao.token`, `lunao.profile`, `lunao.devMode`

### Dev mode fallback (critical!)

If `/api/owner/redeem` returns 404 or the network is unreachable, the app **automatically falls into dev mode**:

1. It calls `GET /api/sites` to find a real deployed site
2. If sites exist, it stubs a profile from the first one (so bookings, editor, etc. are testable)
3. If no sites exist either, it falls back to a generic `"demo-business"` stub
4. Dev mode token format: `dev.<code>.<timestamp>`

**In dev mode**, `refreshProfile()` is a no-op (trusts the cached profile). This means the app is fully testable without any of the owner-specific endpoints.

### Session loading on app start

`loadSession()` reads token + profile from SecureStore. If both exist, the user is signed in automatically (session persistence). A background `refreshProfile()` call silently updates the profile if the endpoint is live.

### Sign out

`clearSession()` deletes all three SecureStore keys and nulls the in-memory token. Redirects to login.

### Auth context interface

```typescript
interface AuthContextValue {
  status: "loading" | "signedIn" | "signedOut";
  session: Session | null;
  profile: OwnerProfile | null;
  devMode: boolean;
  signIn: (code: string) => Promise<Session>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

---

## 7. React Query Cache (`lib/queries.ts`)

### Query keys

```typescript
["bookings", slug]
["conversations", slug]
["chatSession", id]
["siteHtml", slug]
["addons", slug]
```

### Hooks

| Hook | Refetch interval | Retry | Notes |
|------|-----------------|-------|-------|
| `useBookings(slug)` | 60 seconds | 1 | Acts as push-notification fallback |
| `useConversations(slug)` | — | 0 (false) | Fails fast to empty state when endpoint missing |
| `useChatSession(id)` | — | 0 (false) | Same graceful degradation |
| `useSiteHtml(slug)` | — | 1 | Used by the editor WebView |
| `useUpdateBookingStatus(slug)` | — | — | Mutation with optimistic update + rollback |

### Optimistic booking update pattern

1. `onMutate`: cancel in-flight queries, snapshot previous data, update the matching booking's status in cache
2. `onError`: rollback to snapshot
3. `onSettled`: invalidate the bookings query (refetch from server)

---

## 8. Navigation Structure

```
Root Stack (app/_layout.tsx)
├── index.tsx              → Boot Gate (branded splash, redirects based on auth)
├── login.tsx              → Invite code entry
├── (tabs)                 → Tab Navigator
│   ├── home.tsx           → Dashboard
│   ├── bookings.tsx       → Bookings list
│   ├── chats.tsx          → Conversations list
│   ├── editor.tsx         → Site editor (WebView)
│   └── settings.tsx       → Settings
├── booking/[id].tsx       → Booking detail (card presentation)
└── chat/[id].tsx          → Conversation transcript (card presentation)
```

- All stack screens use `headerShown: false`
- `booking/[id]` and `chat/[id]` use `presentation: "card"` with `slide_from_right` animation
- Tab bar uses `Ionicons`, themed active/inactive colors
- Tab switch plays a "navigate" sound + light haptic

---

## 9. Theming System (`theme/`)

### 8 Niche Brands

Each niche has an accent color, dark accent, corner radius, display font, and CTA label:

| Niche | Accent | Dark Accent | Radius | Font | CTA Label |
|-------|--------|-------------|--------|------|-----------|
| Barber | `#C9A96E` (gold) | `#1a1712` | 4px | Playfair Display | Book a Chair |
| Salon | `#C4856A` (rose) | `#2a1620` | 10px | Fraunces | Book Now |
| Dentist | `#0EA5A0` (teal) | `#0b3b3a` | 14px | Plus Jakarta Sans | Book a Visit |
| HVAC | `#0A4D8C` (blue) | `#072e54` | 12px | Manrope | Book Service |
| Gym | `#F59E0B` (amber) | `#111827` | 8px | Inter | Book a Session |
| Roofing | `#C45E04` (orange) | `#1a1a18` | 6px | System | Get a Quote |
| Real Estate | `#C9A86A` (gold) | `#111111` | 2px | Playfair Display | Book a Tour |
| Site (fallback) | `#6d5cff` (purple) | `#15132a` | 16px | System | Book Now |

Niche is resolved case-insensitively via `resolveNiche()` in `theme/palettes.ts`. Unknown niches fall back to "Site".

### Color system

Dark and light palettes are both defined in `ThemeProvider.tsx`. The app radius is the niche radius + 6px (softened for app surfaces). The computed theme exposes:

```typescript
interface ComputedTheme {
  niche: NicheTheme;
  isDark: boolean;
  colors: Colors;           // 22 color tokens
  radius: number;           // standard corners
  radiusLg: number;         // large containers
  radiusSm: number;         // small elements
  ctaLabel: string;         // e.g. "Book a Session"
  heading: (weight?) => string;   // niche display font
  body: (weight?) => string;      // Inter body font
}
```

### Color tokens (22 total)

`bg`, `surface`, `surfaceAlt`, `card`, `cardElevated`, `border`, `hairline`, `text`, `textMuted`, `textFaint`, `accent`, `accentSoft`, `accentDark`, `onAccent`, `success`, `warning`, `danger`, `overlay`

### Fonts

Loaded via `expo-font` in the root layout (`FONT_ASSETS` from `theme/fonts.ts`):

| Font Key | Google Font |
|----------|------------|
| PlayfairDisplay | Playfair Display |
| Fraunces | Fraunces |
| PlusJakartaSans | Plus Jakarta Sans |
| Manrope | Manrope |
| Inter | Inter |
| System | System default (no web font loaded) |

### Theme mode persistence

Stored in AsyncStorage as `lunao.themeMode`. Values: `"system"` (default), `"light"`, `"dark"`. Also respects `AccessibilityInfo.isReduceMotionEnabled()`.

### Monogram (`theme/Monogram.tsx`)

The business initial (first letter of business name) rendered on an accent gradient. Used as the app logo everywhere.

---

## 10. Sound & Haptics (`lib/feedback.ts`)

### Sound events

| Event | Haptic | Description |
|-------|--------|-------------|
| `tap` | selection | Button press |
| `success` | success | Successful action |
| `deploy` | heavy | Site deploy triggered |
| `newBooking` | success | New booking received |
| `navigate` | light | Tab switch |
| `error` | error | Something failed |

### Behavior rules

- Globally controlled by `SettingsProvider`'s `soundEnabled` flag
- On iOS, `playsInSilentMode` is set to `false` — sounds **never play when the phone is silenced**
- On web, sounds are always skipped (haptics don't exist on web either)
- If a sound asset is missing, the event silently fires haptics only
- Audio players are cached in a `Map<SoundEvent, AudioPlayer>` and reused (seek to 0 before replay)
- Sound files live in `assets/sounds/` but are optional — the app works fine without them

---

## 11. Push Notifications (`lib/notifications.ts`)

### Registration flow

1. On login (or on demand from Settings), call `registerForPush()`
2. Request iOS/Android notification permission
3. Obtain Expo push token
4. Send to `POST /api/owner/push-token` (tolerates 404 — endpoint not built yet)

### Foreground handling

- `NotificationsBridge` component (`components/NotificationsBridge.tsx`) listens for foreground notifications
- If the notification data has `type: "booking"`, it deep-links to the booking detail screen
- All other notifications show an in-app toast

### Fallback

If push notifications aren't registered or the backend doesn't send them, bookings auto-refresh every 60 seconds via React Query's `refetchInterval`.

---

## 12. Component Library (`components/`)

| Component | Purpose |
|-----------|---------|
| `Appear.tsx` | Animated entrance (zoom + fade with stagger delay) |
| `Button.tsx` | Primary / Secondary / Ghost variants with press scale animation |
| `Card.tsx` | Elevated card surface, optional pressable variant |
| `DeploySuccess.tsx` | Post-deploy celebration with copyable deploy URL |
| `EmptyState.tsx` | Icon + title + message + optional action button |
| `Field.tsx` | Labeled text input with optional error message |
| `NotificationsBridge.tsx` | Foreground notification listener |
| `Pill.tsx` | Status/feature badge (success / warning / accent / neutral variants) |
| `Screen.tsx` | Themed full-screen shell with safe-area-aware header |
| `ScreenHeader.tsx` | Business-name header with optional back button and subtitle |
| `Sheet.tsx` | Bottom sheet overlay (used for image picker and text editor) |
| `Skeleton.tsx` | Card-shaped loading placeholder |
| `Text.tsx` | Typography system: `variant × weight × color` |
| `Toast.tsx` | Ephemeral notification (success / error / info) |
| `BookingRow.tsx` | Single booking row with source badge and status pill |

### Typography (`components/Text.tsx`)

Variants: `h1`, `h2`, `h3`, `body`, `caption`, `label`

Weights: `regular`, `medium`, `semibold`, `bold`

Colors: mapped from the theme's color tokens + semantic colors (success, warning, danger)

---

## 13. Provider Stack (Root Layout)

The app wraps everything in this provider chain (order matters):

```
GestureHandlerRootView
  SafeAreaProvider
    QueryClientProvider          ← React Query, 30s stale time, retry: 1
      ThemeProvider              ← Niche-based theming + dark/light mode
        SettingsProvider        ← Sound + notification toggles (AsyncStorage)
          AuthProvider          ← Session management (SecureStore)
            ToastProvider       ← Ephemeral toasts
              RootNavigator    ← expo-router Stack
                NotificationsBridge  ← Foreground push handling
```

---

## 14. Dev Mode — How It Works (Critical for Development)

When the backend's owner-specific endpoints (`/api/owner/redeem`, `/api/owner/me`) aren't built yet, the app doesn't break. Here's the fallback chain:

1. User enters any invite code on the login screen
2. `redeemCode()` tries `POST /api/owner/redeem`
3. Gets 404 (not implemented) or network error
4. Calls `buildDevSession()`:
   - Tries `GET /api/sites` to find a real deployed site
   - If found, uses that site's data as the owner profile
   - If not found, falls back to `{ slug: "demo-business", businessName: "Demo Business", niche: "Site", siteUrl: "" }`
5. Session is stored with `devMode: true`
6. `refreshProfile()` becomes a no-op (trusts cached profile)
7. All other endpoints that exist (bookings, sites, editor) work normally

**In dev mode, the app is fully testable** — bookings load, editor works, settings are accessible. Only invite-code auth is faked.

---

## 15. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | **Yes** | The backend URL (e.g. `http://192.168.1.42:8787`). Must be a LAN IP, never `localhost`, because the phone can't reach `localhost`. |

That's it. One env var. Everything else is configured in `app.json`.

---

## 16. Expo Configuration (`app.json`)

| Key | Value |
|-----|-------|
| Name | Lunao Owner |
| Slug | lunao-owner-app |
| Bundle ID | `com.lunao.ownerapp` |
| Orientation | Portrait |
| Scheme | `lunaoowner` (for deep linking) |
| New Architecture | Enabled |
| Background color | `#0a0a0f` |
| iOS supports tablet | Yes |
| iOS background modes | `remote-notification` |
| Web bundler | Metro, single output |

### Plugins

- `expo-router` — file-based routing
- `expo-secure-store` — encrypted token storage
- `expo-font` — Google Fonts loading
- `expo-image-picker` — with photos permission string
- `expo-notifications` — with purple accent color `#6d5cff`
- `expo-asset` — asset bundling

---

## 17. Navigation Sounds

The tab navigator plays a "navigate" sound + light haptic on every tab switch. The `play()` function from `lib/feedback.ts` is fire-and-forget — it never blocks the UI thread.

---

## 18. Backend (Express + SQLite) — What the App Expects

The backend is a separate project but the app is tightly coupled to its API shape. Key things to know:

- Deploys sites to Cloudflare Pages
- Runs an AI chatbot (with Gemini, falls back to rule-based)
- Stores bookings in SQLite (→ Postgres on Railway)
- The `Site` model has a `niche` field that drives the Owner App's entire theme
- The `Addons` model toggles whether booking and chatbot features are enabled for a site

### Backend endpoints the Owner App uses (already built)

| Endpoint | What it does |
|----------|-------------|
| `GET /api/health` | Returns `{ ok: true, mode: string }` |
| `GET /api/sites` | Lists all deployed sites with slug, title, niche, url, updatedAt |
| `GET /api/sites/:slug` | Returns site HTML |
| `PUT /api/sites/:slug` | Accepts `{ html: string }`, returns updated URL |
| `POST /api/sites/:slug/deploy` | Triggers Cloudflare Pages deploy, returns deploy info + URL |
| `GET /api/sites/:slug/addons` | Returns `{ booking: boolean, chatbot: boolean }` |
| `POST /api/sites/:slug/addons` | Accepts `{ booking, chatbot }` |
| `GET /api/bookings?slug=:slug` | Returns `{ bookings: Booking[] }` |
| `PATCH /api/bookings/:id` | Accepts `{ status: "new" | "confirmed" | "cancelled" }` |
| `POST /api/ai/edit` | SSE stream of AI-generated HTML edits |

### Backend endpoints the Owner App expects but doesn't have yet

| Endpoint | What it does |
|----------|-------------|
| `POST /api/owner/redeem` | Accepts `{ code }`, returns `{ token, slug, businessName, niche, siteUrl }` |
| `GET /api/owner/me` | Returns owner profile (same shape as above, no token) |
| `POST /api/owner/push-token` | Accepts `{ token, platform: "ios" | "android" }` |
| `GET /api/sites/:slug/conversations` | Returns `{ conversations: Conversation[] }` |
| `GET /api/chat/sessions/:id` | Returns `{ session: ChatSession, messages: ChatMessage[] }` |

---

## 19. Key Architecture Rules (Non-Negotiable)

1. **ONE env var.** `EXPO_PUBLIC_API_BASE_URL` is the only host configuration. Never hardcode URLs.
2. **One-business scoping.** After login, every request sends `Authorization: Bearer <token>` and is scoped to the owner's `slug`.
3. **Never crash on 404.** If a backend endpoint doesn't exist yet, show a clean empty state. The app must be fully usable even if push never arrives.
4. **Business name on every screen.** Displayed top-right via `ScreenHeader`.
5. **Theme derives from niche.** The business's `niche` field controls colors, fonts, corner radius, and CTA label across the entire app.
6. **Monogram logo.** First letter of business name on an accent gradient — used everywhere as the app identity.
7. **Fire-and-forget side effects.** Sound, haptics, and analytics calls should never block the UI or throw unhandled errors.

---

## 20. File Map

```
lunaoexpoapp/
├── app/
│   ├── _layout.tsx              # Root layout, provider stack, splash screen
│   ├── index.tsx                # Boot gate (branded splash → login or home)
│   ├── login.tsx                # Invite code entry with segmented input
│   ├── booking/
│   │   └── [id].tsx             # Booking detail (confirm/cancel/call/text)
│   ├── chat/
│   │   └── [id].tsx             # Conversation transcript
│   └── (tabs)/
│       ├── _layout.tsx          # Tab navigator (5 tabs + Ionicons)
│       ├── home.tsx             # Dashboard (stats, activity, quick actions)
│       ├── bookings.tsx         # Bookings list with filter chips
│       ├── chats.tsx            # Conversations list with booked badge
│       ├── editor.tsx           # WebView site editor (tap-to-edit + deploy)
│       └── settings.tsx         # Profile, notifications, sound, theme, sign out
├── components/
│   ├── Appear.tsx               # Animated entrance (zoom/fade + stagger)
│   ├── BookingRow.tsx           # Booking list row with source badge + pill
│   ├── Button.tsx               # Primary/Secondary/Ghost with press animation
│   ├── Card.tsx                 # Elevated surface, optional pressable
│   ├── DeploySuccess.tsx        # Post-deploy screen with copyable URL
│   ├── EmptyState.tsx           # Icon + title + message + action
│   ├── Field.tsx                # Labeled text input
│   ├── NotificationsBridge.tsx  # Foreground notification handler
│   ├── Pill.tsx                 # Status badge (success/warning/accent/neutral)
│   ├── Screen.tsx               # Themed screen shell + safe-area header
│   ├── ScreenHeader.tsx         # Business name header with back/subtitle
│   ├── Sheet.tsx                # Bottom sheet overlay
│   ├── Skeleton.tsx             # Card-shaped loading placeholder
│   ├── Text.tsx                 # Typography: variant × weight × color
│   └── Toast.tsx                # Ephemeral toast notification
├── lib/
│   ├── api.ts                   # Typed fetch client + SSE stream
│   ├── auth.ts                  # Session CRUD, redeem, dev fallback
│   ├── AuthContext.tsx           # Auth state provider
│   ├── feedback.ts              # Sound + haptics system
│   ├── format.ts                # Date/time formatting helpers
│   ├── notifications.ts         # Push notification registration + handler
│   ├── queries.ts               # React Query hooks (all server state)
│   ├── SettingsContext.tsx      # Sound/notification toggle persistence
│   └── types.ts                 # TypeScript interfaces (mirror backend)
├── theme/
│   ├── fonts.ts                 # Google Fonts loader + FONT_ASSETS
│   ├── palettes.ts              # 8 niche themes + resolveNiche()
│   ├── ThemeProvider.tsx        # Theme context, dark/light, 22 color tokens
│   └── Monogram.tsx             # Business initial gradient logo
├── assets/
│   └── sounds/                  # 6 sound effect files (optional)
├── app.json                     # Expo config
├── package.json                 # Dependencies
├── SHIP.md                      # Ship & test guide
└── CONTEXT.md                   # ← You are here
```

---

## 21. How to Run

```bash
# Install
npm install

# Set the API URL (only env var needed)
# Create a .env file with:
# EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:8787
# Use your machine's LAN IP, NOT localhost

# Start dev server
npx expo start

# Scan QR with Expo Go (iOS: Camera app, Android: Expo Go app)
```

### Testing without a backend

The app **automatically falls into dev mode** if the owner endpoints aren't available:
1. Open the app → you'll see the login screen
2. Enter any code (e.g. `LUNAO-TEST-1234`)
3. If `/api/sites` has data, the app anchors to the first real site
4. Everything works — bookings, editor, settings — except invite auth is faked

---

## 22. What's Already Done vs. What's Pending

### ✅ Done (~95%)

- All 8 screens built and wired
- Theming system with 8 niche brands
- Sound + haptics on every action
- React Query caching with optimistic updates
- Push notification registration
- Dev mode fallback for testing
- Graceful degradation everywhere
- WebView editor with tap-to-edit
- Invite-code login with segmented input

### ⚠️ Backend endpoints not built yet (app degrades gracefully)

- `POST /api/owner/redeem` → dev mode fallback
- `GET /api/owner/me` → uses cached profile
- `POST /api/owner/push-token` → push works via 60s polling
- `GET /api/sites/:slug/conversations` → empty state in Chats tab
- `GET /api/chat/sessions/:id` → "transcript unavailable" in chat detail

### 🔲 Optional assets (non-blocking)

- 6 sound files in `assets/sounds/` (app skips audio, still fires haptics)
- App icons (`icon.png`, `splash.png`, `adaptive-icon.png`)

---

*Generated: 2026-06-15*
