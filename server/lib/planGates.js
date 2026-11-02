// Server-side plan/tier gating utilities.
//
// Single source of truth for "can this plan do X?" questions. Mirrors the
// PLAN_BALANCE keys in server/lib/credits.js and the defaultMap in
// src/App.tsx — keep these three in sync if a tier is ever renamed.
//
// Tiers are ordered (Free=0 -> Agency=4). All gating helpers take a
// `plan` string and return booleans or derived values.

export const TIER = Object.freeze({
  'Free Plan': 0,
  'Starter Plan': 1,
  'Pro Plan': 2,
  'Agency Plan': 3,
});

export const TIER_NAMES = Object.freeze(Object.keys(TIER));

// Normalise user-supplied plan strings. Some callers send "Pro", others
// "Pro Plan", occasionally "PRO PLAN". We accept all of them.
export function normalisePlan(raw) {
  if (!raw) return 'Free Plan';
  const trimmed = String(raw).trim();
  if (TIER[trimmed]) return trimmed;
  // Try appending " Plan" if a bare name was passed.
  const withSuffix = trimmed.endsWith('Plan') ? trimmed : `${trimmed} Plan`;
  if (TIER[withSuffix]) return withSuffix;
  // Case-insensitive fallback (e.g. "free plan" or "FREE").
  const lower = trimmed.toLowerCase();
  for (const canonical of TIER_NAMES) {
    if (canonical.toLowerCase() === lower) return canonical;
    if (canonical.toLowerCase().replace(' plan', '') === lower) return canonical;
  }
  return 'Free Plan';
}

export function tierLevel(plan) {
  return TIER[normalisePlan(plan)] ?? 0;
}

// --- PWA Activation Allowances per plan tier --------------------------
export const PWA_ALLOWANCE = Object.freeze({
  'Free Plan': 3,
  'Starter Plan': 5,
  'Pro Plan': 15,
  'Agency Plan': 50,
});

export function pwaAllowanceForPlan(plan) {
  return PWA_ALLOWANCE[normalisePlan(plan)] ?? 3;
}


// --- Telnyx / SMS gating ----------------------------------------------

// Bring-your-own Telnyx OAuth flow: Starter, Pro, and Agency can connect
// their own account. Free Plan uses Lunao's shared Canadian number.
export function canUseOwnTelnyx(plan) {
  return tierLevel(plan) >= TIER['Starter Plan'];
}

// True for plans that should *never* see Telnyx OAuth UI in the wizard.
export function isAutomatedSmsPlan(plan) {
  return !canUseOwnTelnyx(plan);
}

// Returns an array of ISO country codes the plan is allowed to SMS, or
// `null` to indicate "any country". Free and Starter are restricted to
// Canada only (single shared CA number).
export function allowedCountries(plan) {
  if (isAutomatedSmsPlan(plan)) return ['CA'];
  return null;
}

// True if `country` is allowed for `plan`. `null` plan = no restriction.
export function isCountryAllowed(plan, country) {
  const list = allowedCountries(plan);
  if (!list) return true;
  if (!country) return false;
  return list.includes(String(country).toUpperCase());
}

// Express middleware factory: blocks the route unless `plan` meets
// the minimum tier. Reads plan from query, body, or header.
//
//   app.get('/api/...', authenticate, requirePlan('Growth Plan'), handler);
export function requirePlan(minTier) {
  const min = TIER[minTier];
  return (req, res, next) => {
    if (typeof min !== 'number') return next(); // misconfigured guard
    const raw = req.body?.plan || req.query?.plan || req.headers['x-user-plan'];
    const lvl = tierLevel(normalisePlan(raw));
    if (lvl < min) {
      return res.status(403).json({
        ok: false,
        error: `This feature requires the ${minTier}.`,
        requiredPlan: minTier,
        currentPlan: normalisePlan(raw),
      });
    }
    return next();
  };
}
