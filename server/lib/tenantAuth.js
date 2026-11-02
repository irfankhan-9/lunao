/**
 * Lunao Stage 3 — Batch 5, Step 2.2: Tenant Authorization & Public Endpoint Security Module
 *
 * Enforces strict tenant isolation and public endpoint hardening:
 * 1. Sole authoritative active-site registry (public.tenants with is_active = true) when Supabase is configured.
 * 2. Fail-closed (HTTP 503) behavior when registry or rate-limiter RPC fails.
 * 3. Socket-peer verified client IP extraction (ignores spoofed cf-connecting-ip, x-real-ip, x-forwarded-for).
 * 4. Coarse per-IP invalid-slug bucket so unknown/inactive slugs never create per-tenant rate-limit rows.
 * 5. Per-IP + per-tenant aggregate atomic rate limiting via SECURITY DEFINER PostgreSQL RPC.
 * 6. Synchronized server-authorized tenant registration and deactivation with public.tenants.
 */

import { db } from './db.js';
import { getSupabase, getPgPool } from './supabase.js';
import { supabase as supabaseCfg } from './config.js';

// Table for direct owner-slug registrations (e.g. site-deploy, rebrands, onboarding)
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS owner_businesses (
      owner_key TEXT NOT NULL,
      slug TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (owner_key, slug)
    );
  `).run();
} catch (_e) {
  /* non-fatal table initialization */
}

// Conservative baseline of verified live tenants from Stage 3 audits
// Used ONLY in isolated offline development mode when Supabase/PostgreSQL is NOT configured.
export const VERIFIED_LIVE_TENANTS = [
  { slug: 'apex-climate-care-austin', name: 'Apex Climate Care', niche: 'HVAC & Climate', is_active: true },
  { slug: 'everest-climate-systems-austin', name: 'Everest Climate Systems', niche: 'HVAC & Climate', is_active: true },
  { slug: 'everest-climate-austin', name: 'Everest Climate', niche: 'HVAC & Climate', is_active: true },
  { slug: 'vintage-cuts-austin', name: 'Vintage Cuts Barber Lounge', niche: 'Barber', is_active: true },
  { slug: 'radiant-smiles-dental-austin', name: 'Radiant Smiles Dental', niche: 'Dental Clinic', is_active: true },
  { slug: 'bright-smiles-dental-boston', name: 'Bright Smiles Dental', niche: 'Dental Clinic', is_active: true },
  { slug: 'acme-salon-dallas', name: 'Acme Salon', niche: 'Hair & Beauty Salon', is_active: true },
  { slug: 'acme-barber-austin', name: 'Acme Barber', niche: 'Barber', is_active: true },
  { slug: 'elite-roofing-pro-austin-roofing', name: 'Elite Roofing Pro', niche: 'Roofing & Construction', is_active: true },
  { slug: 'iron-grit-fitness-brooklyn', name: 'Iron Grit Fitness', niche: 'Gym & Fitness', is_active: true },
  { slug: 'aurora-salon-miami', name: 'Aurora Salon', niche: 'Hair & Beauty Salon', is_active: true },
];

// Offline-only mock registry (NEVER consulted when Supabase/Postgres is configured or in production)
const tenantsRegistry = new Map();
for (const t of VERIFIED_LIVE_TENANTS) {
  tenantsRegistry.set(t.slug, { ...t });
}

// Offline-only rate-limit bucket store (NEVER used when Supabase/Postgres is configured or in production)
const rateLimitBuckets = new Map();

/**
 * Returns true if Supabase/PostgreSQL is configured (via pgPool, Supabase client, or config).
 */
export function isSupabaseConfigured() {
  return Boolean(getPgPool() || getSupabase() || supabaseCfg.live);
}

/**
 * Synchronous in-memory tenant registration (strictly for offline/mock dev mode).
 * When Supabase is configured, verifyActiveTenantAsync ignores this Map completely.
 */
export function registerTenant(slug, name = '', isActive = true) {
  if (!slug) return;
  const cleanSlug = String(slug).toLowerCase().trim();
  tenantsRegistry.set(cleanSlug, {
    slug: cleanSlug,
    name: name || cleanSlug,
    is_active: Boolean(isActive),
    updated_at: Date.now(),
  });
}

/**
 * Authoritative async tenant registration that synchronizes directly with public.tenants
 * when Supabase is configured. Surfaces database failures instead of creating inconsistent state.
 */
export async function registerTenantAsync(slug, name = '', isActive = true, niche = 'General') {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  if (!cleanSlug || !/^[a-z0-9][a-z0-9-]{0,120}$/.test(cleanSlug)) {
    const err = new Error('Invalid tenant slug for registration');
    err.status = 400;
    throw err;
  }
  const cleanName = String(name || cleanSlug).trim();
  const cleanNiche = String(niche || 'General').trim();
  const activeBool = Boolean(isActive);
  const tenantId = `t-${cleanSlug.slice(0, 48)}`;

  if (isSupabaseConfigured() || process.env.NODE_ENV === 'production') {
    const pool = getPgPool();
    const sb = getSupabase();
    if (!pool && !sb) {
      const err = new Error('Canonical tenant registry unavailable: database credentials not configured');
      err.status = 503;
      throw err;
    }

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO public.tenants (id, slug, name, niche, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             niche = EXCLUDED.niche,
             is_active = EXCLUDED.is_active,
             updated_at = NOW()`,
          [tenantId, cleanSlug, cleanName, cleanNiche, activeBool]
        );
      } catch (dbErr) {
        const err = new Error(`Failed to synchronize tenant "${cleanSlug}" to public.tenants: ${dbErr.message}`);
        err.status = 503;
        throw err;
      }
    } else if (sb) {
      const { error } = await sb.from('tenants').upsert(
        {
          id: tenantId,
          slug: cleanSlug,
          name: cleanName,
          niche: cleanNiche,
          is_active: activeBool,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      );
      if (error) {
        const err = new Error(`Failed to synchronize tenant "${cleanSlug}" to public.tenants: ${error.message}`);
        err.status = 503;
        throw err;
      }
    }
  }

  registerTenant(cleanSlug, cleanName, activeBool);
  return { slug: cleanSlug, name: cleanName, niche: cleanNiche, is_active: activeBool };
}

/**
 * Marks a tenant as inactive in offline memory.
 */
export function deactivateTenant(slug) {
  if (!slug) return;
  const cleanSlug = String(slug).toLowerCase().trim();
  const existing = tenantsRegistry.get(cleanSlug);
  if (existing) {
    existing.is_active = false;
  } else {
    tenantsRegistry.set(cleanSlug, { slug: cleanSlug, name: cleanSlug, is_active: false });
  }
}

/**
 * Authoritative async tenant deactivation synchronized with public.tenants.
 */
export async function deactivateTenantAsync(slug) {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  if (!cleanSlug) {
    const err = new Error('Missing slug for deactivation');
    err.status = 400;
    throw err;
  }

  if (isSupabaseConfigured() || process.env.NODE_ENV === 'production') {
    const pool = getPgPool();
    const sb = getSupabase();
    if (!pool && !sb) {
      const err = new Error('Canonical tenant registry unavailable');
      err.status = 503;
      throw err;
    }
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.tenants SET is_active = FALSE, updated_at = NOW() WHERE slug = $1`,
          [cleanSlug]
        );
      } catch (dbErr) {
        const err = new Error(`Failed to deactivate tenant "${cleanSlug}" in public.tenants: ${dbErr.message}`);
        err.status = 503;
        throw err;
      }
    } else if (sb) {
      const { error } = await sb
        .from('tenants')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('slug', cleanSlug);
      if (error) {
        const err = new Error(`Failed to deactivate tenant "${cleanSlug}" in public.tenants: ${error.message}`);
        err.status = 503;
        throw err;
      }
    }
  }

  deactivateTenant(cleanSlug);
  return { slug: cleanSlug, is_active: false };
}

/**
 * Removes a temporary tenant registration from offline memory.
 */
export function removeTenant(slug) {
  if (!slug) return;
  const cleanSlug = String(slug).toLowerCase().trim();
  tenantsRegistry.delete(cleanSlug);
}

/**
 * Removes a temporary tenant registration from both public.tenants and local memory (for test cleanup).
 */
export async function removeTenantAsync(slug) {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  if (!cleanSlug) return;
  const pool = getPgPool();
  const sb = getSupabase();
  if (pool) {
    try {
      await pool.query(`DELETE FROM public.tenants WHERE slug = $1`, [cleanSlug]);
    } catch (_e) {
      /* ignore cleanup notice */
    }
  } else if (sb) {
    try {
      await sb.from('tenants').delete().eq('slug', cleanSlug);
    } catch (_e) {
      /* ignore cleanup notice */
    }
  }
  removeTenant(cleanSlug);
}

// In-memory owner->slug mapping set to complement SQLite table
const ownerBusinessesSet = new Set();

/**
 * Synchronous owner-business mapping (for offline dev / unit tests).
 */
export function registerOwnerBusiness(ownerKey, slug) {
  if (!ownerKey || !slug) return;
  const cleanOwner = String(ownerKey).trim();
  const cleanSlug = String(slug).toLowerCase().trim();
  ownerBusinessesSet.add(`${cleanOwner}:${cleanSlug}`);
  registerTenant(cleanSlug, cleanSlug, true);
  try {
    db.prepare(`
      INSERT INTO owner_businesses (owner_key, slug, created_at)
      VALUES (?, ?, ?)
    `).run(cleanOwner, cleanSlug, Date.now());
  } catch (err) {
    console.warn('[tenantAuth] registerOwnerBusiness notice:', err.message);
  }
}

/**
 * Server-authorized async owner business registration that synchronizes to public.tenants first.
 * Surfaces partial registration failures so local state and Supabase never diverge.
 */
export async function registerOwnerBusinessAsync(ownerKey, slug, meta = {}) {
  const cleanOwner = String(ownerKey || '').trim();
  const cleanSlug = String(slug || '').toLowerCase().trim();
  if (!cleanOwner || !cleanSlug) {
    const err = new Error('Both authenticated ownerKey and valid slug are required to register a business');
    err.status = 400;
    throw err;
  }

  // 1. Synchronize to canonical public.tenants first; throws on failure
  const tenantRecord = await registerTenantAsync(
    cleanSlug,
    meta.name || cleanSlug,
    true,
    meta.niche || 'General'
  );

  // 2. Record owner mapping locally only after canonical registration succeeds
  ownerBusinessesSet.add(`${cleanOwner}:${cleanSlug}`);
  try {
    db.prepare(`
      INSERT INTO owner_businesses (owner_key, slug, created_at)
      VALUES (?, ?, ?)
    `).run(cleanOwner, cleanSlug, Date.now());
  } catch (err) {
    console.warn('[tenantAuth] registerOwnerBusinessAsync sqlite notice:', err.message);
  }

  return tenantRecord;
}

/**
 * Verifies whether a business slug belongs to a registered, active tenant.
 *
 * PHASE 4 GUARANTEE:
 * When Supabase is configured (or in production):
 * - public.tenants is the SOLE authoritative source.
 * - An absent row returns HTTP 404 (NEVER falls back to VERIFIED_LIVE_TENANTS or tenantsRegistry).
 * - A database or registry query error fails closed with HTTP 503.
 */
export async function verifyActiveTenantAsync(slug) {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, status: 400, error: 'Missing required field: slug' };
  }
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug || !/^[a-z0-9][a-z0-9-]{0,120}$/.test(cleanSlug)) {
    return { valid: false, status: 400, error: 'Missing or invalid required field: slug' };
  }

  const isProd = process.env.NODE_ENV === 'production';
  const pool = getPgPool();
  const sb = getSupabase();

  if (isSupabaseConfigured() || isProd) {
    if (!pool && !sb) {
      console.error('[tenantAuth] Tenant verification failed closed: no database connection configured');
      return {
        valid: false,
        status: 503,
        error: 'Service temporarily unavailable: unable to verify tenant registration',
      };
    }

    if (pool) {
      try {
        const res = await pool.query(
          `SELECT slug, name, is_active FROM public.tenants WHERE slug = $1 LIMIT 1`,
          [cleanSlug]
        );
        const tenant = res.rows && res.rows[0] ? res.rows[0] : null;
        if (!tenant || tenant.is_active !== true) {
          return {
            valid: false,
            status: 404,
            error: `Unregistered or inactive business tenant: ${cleanSlug}`,
          };
        }
        return { valid: true, tenant, source: 'supabase_pg' };
      } catch (err) {
        console.error('[tenantAuth] PostgreSQL tenant lookup error (failing closed):', err.message);
        return {
          valid: false,
          status: 503,
          error: 'Service temporarily unavailable: unable to verify tenant registration',
        };
      }
    }

    if (sb) {
      try {
        const { data: tenant, error } = await sb
          .from('tenants')
          .select('slug, name, is_active')
          .eq('slug', cleanSlug)
          .maybeSingle();

        if (error) {
          console.error('[tenantAuth] Supabase tenant lookup error (failing closed):', error.message);
          return {
            valid: false,
            status: 503,
            error: 'Service temporarily unavailable: unable to verify tenant registration',
          };
        }

        if (!tenant || tenant.is_active !== true) {
          return {
            valid: false,
            status: 404,
            error: `Unregistered or inactive business tenant: ${cleanSlug}`,
          };
        }

        return { valid: true, tenant, source: 'supabase_http' };
      } catch (err) {
        console.error('[tenantAuth] Supabase tenant lookup exception (failing closed):', err.message);
        return {
          valid: false,
          status: 503,
          error: 'Service temporarily unavailable: unable to verify tenant registration',
        };
      }
    }
  }

  // Strictly isolated offline/mock fallback ONLY when Supabase is NOT configured AND NODE_ENV !== 'production'
  const localTenant = tenantsRegistry.get(cleanSlug);
  if (!localTenant || localTenant.is_active !== true) {
    return {
      valid: false,
      status: 404,
      error: `Unregistered or inactive business tenant: ${cleanSlug}`,
    };
  }

  return { valid: true, tenant: localTenant, source: 'offline_mock' };
}

// ============================================================================
// PHASE 2: TRUSTED PROXY PEER VERIFICATION & CLIENT IP EXTRACTION
// ============================================================================

// Official Cloudflare IPv4 CIDR blocks (https://www.cloudflare.com/ips-v4)
export const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^[0-9a-fA-F:]{2,45}$/;

export function normalizeIp(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let ip = raw.trim();
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip;
}

export function isValidIpAddress(raw) {
  const ip = normalizeIp(raw);
  if (!ip || ip.length > 45 || ip.includes(',') || /\s/.test(ip)) return false;
  if (IPV4_REGEX.test(ip)) return true;
  if (ip.includes(':') && IPV6_REGEX.test(ip)) return true;
  return false;
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0)) >>> 0;
}

export function ipMatchesCidr(ip, cidr) {
  const cleanIp = normalizeIp(ip);
  const cleanCidr = String(cidr || '').trim();
  if (!cleanIp || !cleanCidr) return false;
  if (!cleanCidr.includes('/')) {
    return cleanIp === normalizeIp(cleanCidr);
  }
  const [rangeIp, prefixStr] = cleanCidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(cleanIp);
  const rangeInt = ipv4ToInt(normalizeIp(rangeIp));
  if (ipInt === null || rangeInt === null) return false;
  if (prefix === 0) return true;
  const mask = (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isVerifiedCloudflarePeer(peerIp) {
  const cleanPeer = normalizeIp(peerIp);
  if (!IPV4_REGEX.test(cleanPeer)) return false;
  return CLOUDFLARE_IPV4_CIDRS.some((cidr) => ipMatchesCidr(cleanPeer, cidr));
}

export function isConfiguredTrustedProxyPeer(peerIp, customTrustedCidrs) {
  const cleanPeer = normalizeIp(peerIp);
  if (!cleanPeer) return false;
  const rawList =
    customTrustedCidrs !== undefined
      ? customTrustedCidrs
      : process.env.TRUSTED_PROXY_CIDRS || '';
  const cidrs = Array.isArray(rawList)
    ? rawList
    : String(rawList)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (cidrs.length === 0) return false;
  return cidrs.some((cidr) => ipMatchesCidr(cleanPeer, cidr));
}

/**
 * Extracts client IP strictly from verified TCP socket peer or a peer-verified proxy hop.
 *
 * Security Rules (Phase 2):
 * 1. NEVER trusts caller-supplied x-real-ip.
 * 2. NEVER trusts caller-supplied cf-connecting-ip unless the immediate TCP socket peer
 *    is verified to be within Cloudflare's published IP ranges (and cf-ray is present).
 * 3. NEVER trusts X-Forwarded-For unless the immediate TCP socket peer matches an explicit
 *    operator-configured TRUSTED_PROXY_CIDRS allowlist, in which case the rightmost non-proxy
 *    IP appended by the verified proxy is extracted (never the spoofable leftmost entry).
 * 4. When a trusted proxy cannot be verified (e.g. direct origin access or loopback 127.0.0.1),
 *    derives the address strictly from the actual TCP socket peer (`req.socket.remoteAddress`).
 */
export function extractTrustedIpFromExpress(req, options = {}) {
  const rawSocketPeer =
    options.socketPeerOverride ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    '';
  const socketPeer = normalizeIp(rawSocketPeer) || '127.0.0.1';

  // Case 1: Immediate TCP peer is a verified Cloudflare edge node
  if (isVerifiedCloudflarePeer(socketPeer)) {
    const cfRay = req?.headers?.['cf-ray'];
    const cfIp = req?.headers?.['cf-connecting-ip'];
    if (cfRay && cfIp && isValidIpAddress(String(cfIp))) {
      return normalizeIp(String(cfIp));
    }
    return socketPeer;
  }

  // Case 2: Immediate TCP peer is in the explicit TRUSTED_PROXY_CIDRS allowlist
  if (isConfiguredTrustedProxyPeer(socketPeer, options.trustedProxyCidrs)) {
    const xff = req?.headers?.['x-forwarded-for'];
    if (xff && typeof xff === 'string') {
      const hops = xff
        .split(',')
        .map((s) => normalizeIp(s))
        .filter((ip) => isValidIpAddress(ip));
      // Traverse right-to-left (closest to our verified proxy) and pick the first non-proxy hop
      for (let i = hops.length - 1; i >= 0; i--) {
        const hopIp = hops[i];
        if (!isConfiguredTrustedProxyPeer(hopIp, options.trustedProxyCidrs)) {
          return hopIp;
        }
      }
    }
    return socketPeer;
  }

  // Case 3: Unverified peer or direct origin access -> ignore all forwarded headers and use socket peer
  return isValidIpAddress(socketPeer) ? socketPeer : '127.0.0.1';
}

export function hashClientIp(ip) {
  const salted = `lunao-rl-salt-2026:${ip}`;
  let h = 5381;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) + h) + salted.charCodeAt(i);
    h |= 0;
  }
  return 'ip_' + Math.abs(h).toString(36);
}

// Allow test suite to simulate RPC/storage failure on Express rate limiter
let simulateRateLimitFailureFlag = false;
export function setSimulateRateLimitFailure(shouldFail) {
  simulateRateLimitFailureFlag = Boolean(shouldFail);
}

async function executeSingleBucketRateLimit(bucketKey, maxRequests) {
  const isProd = process.env.NODE_ENV === 'production';
  const pool = getPgPool();
  const sb = getSupabase();
  const now = Date.now();
  const windowStart = Math.floor(now / 300000) * 300000;

  if (simulateRateLimitFailureFlag) {
    console.error('[tenantAuth] Simulated rate-limit RPC failure (failing closed with 503)');
    return {
      ok: false,
      allowed: false,
      status: 503,
      error: 'Service temporarily unavailable: rate limiter failure',
    };
  }

  if (isSupabaseConfigured() || isProd) {
    if (!pool && !sb) {
      console.error('[tenantAuth] Rate limiter failed closed: no database connection configured');
      return {
        ok: false,
        allowed: false,
        status: 503,
        error: 'Service temporarily unavailable: rate limiter unreachable',
      };
    }

    if (pool) {
      try {
        const res = await pool.query(
          `SELECT public.check_and_increment_rate_limit($1, $2, $3, $4) AS rl`,
          [bucketKey, windowStart, maxRequests, now]
        );
        const rlData = res.rows && res.rows[0] ? res.rows[0].rl : null;
        if (!rlData || typeof rlData.allowed !== 'boolean') {
          console.error('[tenantAuth] Malformed rate-limit response from PostgreSQL');
          return {
            ok: false,
            allowed: false,
            status: 503,
            error: 'Service temporarily unavailable: rate limiter error',
          };
        }
        return {
          ok: true,
          allowed: rlData.allowed,
          count: rlData.count,
          retryAfter: Number(rlData.retry_after || 300),
        };
      } catch (err) {
        console.error('[tenantAuth] PostgreSQL rate limit RPC error (failing closed):', err.message);
        return {
          ok: false,
          allowed: false,
          status: 503,
          error: 'Service temporarily unavailable: rate limiter error',
        };
      }
    }

    if (sb && typeof sb.rpc === 'function') {
      try {
        const { data: rlData, error: rlErr } = await sb.rpc('check_and_increment_rate_limit', {
          p_bucket_key: bucketKey,
          p_window_start: windowStart,
          p_max_requests: maxRequests,
          p_now: now,
        });
        const rlObj = Array.isArray(rlData) ? rlData[0] : rlData;
        if (rlErr || !rlObj || typeof rlObj.allowed !== 'boolean') {
          console.error('[tenantAuth] Supabase rate limit RPC error (failing closed):', rlErr?.message || 'Invalid response');
          return {
            ok: false,
            allowed: false,
            status: 503,
            error: 'Service temporarily unavailable: rate limiter error',
          };
        }
        return {
          ok: true,
          allowed: rlObj.allowed,
          count: rlObj.count,
          retryAfter: Number(rlObj.retry_after || 300),
        };
      } catch (err) {
        console.error('[tenantAuth] Supabase rate limit RPC exception (failing closed):', err.message);
        return {
          ok: false,
          allowed: false,
          status: 503,
          error: 'Service temporarily unavailable: rate limiter error',
        };
      }
    }
  }

  // Strictly isolated offline/mock in-process rate limiter ONLY when Supabase is NOT configured AND NODE_ENV !== 'production'
  const fullKey = `${bucketKey}:${windowStart}`;
  const current = (rateLimitBuckets.get(fullKey) || 0) + 1;
  rateLimitBuckets.set(fullKey, current);

  if (Math.random() < 0.02) {
    for (const [k] of rateLimitBuckets) {
      const parts = k.split(':');
      const win = Number(parts[parts.length - 1]);
      if (win && win < now - 3600000) {
        rateLimitBuckets.delete(k);
      }
    }
  }

  const retryAfter = Math.max(1, Math.ceil((windowStart + 300000 - now) / 1000));
  return {
    ok: true,
    allowed: current <= maxRequests,
    count: current,
    retryAfter: current > maxRequests ? retryAfter : 0,
  };
}

/**
 * Enforces coarse per-IP rate limiting for invalid/inactive tenant requests so unknown slugs
 * NEVER create per-tenant rows in public.endpoint_rate_limits.
 */
export async function checkInvalidSlugRateLimitAsync(req, endpoint, maxRequests = 15) {
  const clientIp = extractTrustedIpFromExpress(req);
  const ipHash = hashClientIp(clientIp);
  const cleanEndpoint = String(endpoint || 'public').toLowerCase().trim();
  const bucketKey = `${ipHash}:invalid_slug:${cleanEndpoint}`;
  return executeSingleBucketRateLimit(bucketKey, maxRequests);
}

/**
 * Shared atomic rate limiter for verified active tenants on Express public booking & lead endpoints.
 * Enforces BOTH per-IP (`${ipHash}:${endpoint}:${slug}`) and per-tenant aggregate (`tenant_agg:${endpoint}:${slug}`).
 * Fails closed with status 503 if rate-limit storage or RPC fails.
 */
export async function checkPublicRateLimitAsync(req, endpoint, slug, maxRequests = 10, maxTenantAggregate = 30) {
  const clientIp = extractTrustedIpFromExpress(req);
  const ipHash = hashClientIp(clientIp);
  const cleanEndpoint = String(endpoint || 'public').toLowerCase().trim();
  const cleanSlug = String(slug || '').toLowerCase().trim();

  // 1. Per-IP + Tenant + Endpoint bucket
  const ipBucketKey = `${ipHash}:${cleanEndpoint}:${cleanSlug}`;
  const ipRes = await executeSingleBucketRateLimit(ipBucketKey, maxRequests);
  if (!ipRes.ok || !ipRes.allowed) {
    return ipRes;
  }

  // 2. Per-Tenant Aggregate bucket
  const aggMax = Math.max(
    maxRequests,
    Number(
      cleanEndpoint === 'bookings'
        ? process.env.PUBLIC_BOOKINGS_TENANT_MAX_PER_WINDOW || maxTenantAggregate
        : process.env.PUBLIC_LEADS_TENANT_MAX_PER_WINDOW || maxTenantAggregate
    ) || 30
  );
  const aggBucketKey = `tenant_agg:${cleanEndpoint}:${cleanSlug}`;
  const aggRes = await executeSingleBucketRateLimit(aggBucketKey, aggMax);
  if (!aggRes.ok || !aggRes.allowed) {
    return aggRes;
  }

  return ipRes;
}

/**
 * Clears local offline rate limit buckets (for isolated test cleanup).
 */
export function clearRateLimitBuckets() {
  rateLimitBuckets.clear();
}

/**
 * Checks whether an authenticated owner is authorized to access a given business slug.
 */
export function verifyOwnerSlugAccess(ownerKey, slug, req = null) {
  if (!slug) return false;
  const cleanSlug = String(slug).toLowerCase().trim();

  if (req && req.tenantSlug && String(req.tenantSlug).toLowerCase().trim() === cleanSlug) {
    return true;
  }

  if (!ownerKey) return false;
  const cleanOwner = String(ownerKey).trim();

  // 0. Direct in-memory owner_businesses registration
  if (ownerBusinessesSet.has(`${cleanOwner}:${cleanSlug}`)) {
    return true;
  }

  // 1. Direct owner_businesses registration
  try {
    const ob = db.prepare('SELECT 1 FROM owner_businesses WHERE owner_key = ? AND slug = ?').get(cleanOwner, cleanSlug);
    if (ob) return true;
  } catch {}

  // 2. campaign_leads joined with campaigns
  try {
    const cl = db.prepare(`
      SELECT 1 FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE c.owner_key = ? AND cl.slug = ?
      LIMIT 1
    `).get(cleanOwner, cleanSlug);
    if (cl) return true;
  } catch {}

  // 3. email_leads joined with email_campaigns
  try {
    const el = db.prepare(`
      SELECT 1 FROM email_leads el
      JOIN email_campaigns ec ON ec.id = el.campaign_id
      WHERE ec.owner_key = ? AND el.slug = ?
      LIMIT 1
    `).get(cleanOwner, cleanSlug);
    if (el) return true;
  } catch {}

  // 4. site_history
  try {
    const sh = db.prepare(`
      SELECT 1 FROM site_history
      WHERE owner_key = ? AND (parent_slug = ? OR id = ?)
      LIMIT 1
    `).get(cleanOwner, cleanSlug, cleanSlug);
    if (sh) return true;
  } catch {}

  // 5. custom_templates
  try {
    const ct = db.prepare('SELECT 1 FROM custom_templates WHERE owner_key = ? AND slug = ? LIMIT 1').get(cleanOwner, cleanSlug);
    if (ct) return true;
  } catch {}

  return false;
}
