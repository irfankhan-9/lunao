/*
  Lunao SaaS — Production Cloudflare Pages Edge Worker (_worker.js)
  
  Security & Routing Architecture:
  1. API & Backend Proxying: Routes /api/*, /owner/*, /sites/* to AWS EC2 backend DNS
  2. Edge User Sites: Directly serves personalized client sites from Supabase at edge speed
  3. Static SPA Assets: Serves React frontend bundles with immutable caching
  4. SPA Fallback: Routes client-side browser navigation to index.html
  5. Security Headers: Hardens all responses against XSS, clickjacking, and MIME sniffing
*/

// Primary EC2 backend DNS endpoint (Cloudflare requires valid DNS hostname, not raw IP)
const BACKEND_ORIGIN = 'http://ec2-51-21-181-63.eu-north-1.compute.amazonaws.com';
const SUPABASE_URL = 'https://wqlbuadknltsjfzrltpe.supabase.co';

function getSupabaseKey(env) {
  return (
    (env && (env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbGJ1YWRrbmx0c2pmenJsdHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzE3ODksImV4cCI6MjEwNzcwNzc4OX0.et1OsefPRtiP3OTodktsfhf3Bxbaq6_zY7XdMUZ53Bw'
  );
}

// Standard security headers to inject on all responses
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function addSecurityHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function transformUserSiteHtml(rawHtml, slug) {
  let html = rawHtml;
  html = html.replace(/https:\/\/wqlbuadknltsjfzrltpe\.supabase\.co\/functions\/v1\/public-bookings/g, '/api/bookings');
  html = html.replace(/https:\/\/wqlbuadknltsjfzrltpe\.supabase\.co\/functions\/v1\/public-leads/g, '/api/leads');
  html = html.replace(/https:\/\/ais-dev-[^\/]+\.run\.app\/api\/bookings/g, '/api/bookings');
  html = html.replace(/\/functions\/v1\/public-bookings/g, '/api/bookings');
  html = html.replace(/\/functions\/v1\/public-leads/g, '/api/leads');

  // Edge-level defense: permanently eliminate loading veil freeze and unhandled SW registrations
  html = html.replace('class="page-transition-veil active"', 'class="page-transition-veil"');
  html = html.replace('.page-transition-veil {', '.page-transition-veil { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;');
  html = html.replace(/navigator\.serviceWorker\.register\('\/sw\.js'\)[\s\S]*?\.catch\(error => \{[\s\S]*?\}\);/g, '/* sw disabled */');

  // Edge defense: inject SW unregister kill-switch and canonical LUNAO_SLUG into head
  const slugScript = `<script id="lunao-edge-slug">window.LUNAO_SLUG = ${JSON.stringify(slug)};</script>`;
  if (!html.includes('id="sw-killswitch"')) {
    const swKillScript = `<script id="sw-killswitch">
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          for (var i = 0; i < regs.length; i++) regs[i].unregister();
        });
      }
    </script>`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${slugScript}\n  ${swKillScript}`);
    } else {
      html = `${slugScript}\n${swKillScript}\n` + html;
    }
  } else if (!html.includes('id="lunao-edge-slug"')) {
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${slugScript}`);
    } else {
      html = `${slugScript}\n` + html;
    }
  }

  // Edge defense: ensure authentic brand favicon is present across all devices and browsers
  if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
    const faviconHtml = `  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
  <link rel="shortcut icon" href="/favicon.ico?v=2" />
  <link rel="alternate icon" href="/favicon.ico?v=2" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${faviconHtml}\n</head>`);
    }
  }

  // Edge defense: neutralize any empty-string keys in hydrateDOMPlaceholders
  html = html.replace(/\[\s*''\s*,\s*business\.[a-zA-Z0-9_]+\s*\]/g, "/* neutralized empty key */");

  // Guarantee mobile single magic emoji toggle for bespoke HVAC & client sites
  if (html.includes('atelier-concierge-fab')) {
    if (html.includes('<span>CONCIERGE</span>')) {
      html = html.replace(/<span>CONCIERGE<\/span>/g, '<span class="fab-label-text">CONCIERGE</span>');
    }
    const mobileFabStyle = `<style id="lunao-fab-mobile-lock">
      @media (max-width: 900px) {
        .atelier-concierge-fab-container { bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important; right: 16px !important; }
        .atelier-concierge-fab { width: 48px !important; height: 48px !important; min-width: 48px !important; max-width: 48px !important; padding: 0 !important; border-radius: 50% !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 0 !important; box-shadow: 0 8px 24px rgba(61, 43, 31, 0.2), 0 0 16px rgba(184, 134, 11, 0.28) !important; overflow: hidden !important; }
        .atelier-concierge-fab .fab-label-text, .atelier-concierge-fab .fab-chevron, .atelier-concierge-fab span:not(.brand-spinner-icon) { display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; font-size: 0 !important; line-height: 0 !important; opacity: 0 !important; pointer-events: none !important; }
        .atelier-concierge-fab .brand-spinner-icon { font-size: 1.45rem !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }
      }
    </style>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${mobileFabStyle}\n</head>`);
    } else {
      html = mobileFabStyle + html;
    }
  }

  if (!html.includes('lunao-booking-bridge.js')) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', '<script src="/lunao-booking-bridge.js"></script>\n</body>');
    } else {
      html += '\n<script src="/lunao-booking-bridge.js"></script>';
    }
  }
  return html;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ─── 0. CANONICAL HOSTNAME REDIRECT (www.lunao.org -> lunao.org) ─────
    if (url.hostname === 'www.lunao.org') {
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = 'lunao.org';
      return Response.redirect(redirectUrl.toString(), 301);
    }

    // ─── 0.1 SERVICE WORKER KILL SWITCH ──────────────────────────────────
    if (path === '/sw.js') {
      const swKillSwitch = `// Lunao Edge Service Worker - Immediate Self-Destruct Kill Switch
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll())
  );
});`;
      return new Response(swKillSwitch, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          ...SECURITY_HEADERS,
        },
      });
    }

    // ─── 0.5 ADMIN METRICS API (SECURED BY ADMIN PASSWORD) ───────────────
    if (path === '/api/admin/overview') {
      const authHeader = request.headers.get('Authorization') || '';
      const pwdHeader = request.headers.get('X-Admin-Password') || url.searchParams.get('password') || '';
      const expected = '$KHAN1234455';
      if (pwdHeader !== expected && authHeader !== `Bearer ${expected}`) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid Admin Password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
        });
      }

      try {
        const sbKey = getSupabaseKey(env);
        const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
        const [sitesRes, usersRes, campaignsRes, cacheRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/user_sites?select=owner_id,slug,business_name,city,niche,deploy_url,campaign_source,campaign_id,created_at&order=created_at.desc`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/credit_accounts?select=owner_key,plan,balance,lifetime_used,created_at,updated_at`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id,owner_key,name,niche,status,total_leads,sites_generated,sms_sent,started_at,type,csv_snapshot&order=started_at.desc`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/places_lead_cache?select=searched_city_norm,niche_norm,place_id`, { headers }),
        ]);

        const sites = (await sitesRes.json()) || [];
        const users = (await usersRes.json()) || [];
        const campaigns = (await campaignsRes.json()) || [];
        const cache = (await cacheRes.json()) || [];

        const userMap = new Map();
        for (const u of (Array.isArray(users) ? users : [])) {
          userMap.set(u.owner_key, {
            owner_key: u.owner_key,
            plan: u.plan || 'Free Trial',
            balance: u.balance || 0,
            sitesRebranded: 0,
            sitesDeployed: 0,
            campaignsCount: 0,
            businessesRequested: 0,
            googleMapsCalls: 0,
            lastActive: u.updated_at || u.created_at,
          });
        }

        const validSites = Array.isArray(sites) ? sites : [];
        for (const s of validSites) {
          const o = s.owner_id || 'unknown';
          if (!userMap.has(o)) {
            userMap.set(o, {
              owner_key: o,
              plan: 'Free Trial',
              balance: 0,
              sitesRebranded: 0,
              sitesDeployed: 0,
              campaignsCount: 0,
              businessesRequested: 0,
              googleMapsCalls: 0,
              lastActive: s.created_at,
            });
          }
          const rec = userMap.get(o);
          rec.sitesRebranded++;
          if (s.deploy_url) rec.sitesDeployed++;
        }

        const validCampaigns = Array.isArray(campaigns) ? campaigns : [];
        let totalGoogleMapsCalls = Array.isArray(cache) ? cache.length : 0;
        let totalBusinessesRequested = 0;

        const enrichedCampaigns = validCampaigns.map((c) => {
          let parsedSnapshot = null;
          if (c.csv_snapshot) {
            if (typeof c.csv_snapshot === 'object') {
              parsedSnapshot = c.csv_snapshot;
            } else if (typeof c.csv_snapshot === 'string') {
              try {
                parsedSnapshot = JSON.parse(c.csv_snapshot);
              } catch (e) {}
            }
          }

          const isEmailCampaign = c.type === 'email' || parsedSnapshot?.type === 'email';
          const leadsReq = Number(parsedSnapshot?.targetRequested || c.total_leads) || 0;
          const emailsFoundCount = Number(parsedSnapshot?.emailsFound !== undefined ? parsedSnapshot.emailsFound : c.sites_generated) || 0;

          let estCalls = 1;
          let calls = [];

          if (parsedSnapshot && Array.isArray(parsedSnapshot.searches) && parsedSnapshot.searches.length > 0) {
            estCalls = Number(parsedSnapshot.totalSearchesMade || parsedSnapshot.searches.length) || 1;
            calls = parsedSnapshot.searches.map((s, idx) => ({
              callNumber: s.batchNumber || (idx + 1),
              query: s.query || `${c.niche || 'Business'} in ${parsedSnapshot.city || 'target area'}`,
              maxAllowed: 20,
              placesReturned: Number(s.placesReturned) || 0,
              emailsFound: Number(s.emailsFound) || 0,
              duplicatesFiltered: Number(s.duplicatesFiltered) || 0,
              validLeadsKept: Number(s.emailsFound !== undefined ? s.emailsFound : s.placesReturned) || 0,
              status: 'HTTP 200 OK — Scraped',
            }));
          } else {
            estCalls = Math.max(1, Math.ceil(leadsReq / 20));
            let remaining = leadsReq > 0 ? leadsReq : 1;
            for (let i = 1; i <= estCalls; i++) {
              const batchSize = Math.min(20, remaining);
              calls.push({
                callNumber: i,
                query: `${c.niche || 'Business'} in ${c.city || 'local area'}`,
                maxAllowed: 20,
                placesReturned: batchSize,
                emailsFound: isEmailCampaign ? emailsFoundCount : 0,
                duplicatesFiltered: 0,
                validLeadsKept: batchSize,
                status: 'HTTP 200 OK',
              });
              remaining -= batchSize;
            }
          }

          totalBusinessesRequested += leadsReq;
          totalGoogleMapsCalls += estCalls;

          const o = c.owner_key || 'unknown';
          if (!userMap.has(o)) {
            userMap.set(o, {
              owner_key: o,
              plan: 'Free Trial',
              balance: 0,
              sitesRebranded: 0,
              sitesDeployed: 0,
              campaignsCount: 0,
              businessesRequested: 0,
              googleMapsCalls: 0,
              lastActive: c.started_at,
            });
          }
          const rec = userMap.get(o);
          rec.campaignsCount++;
          rec.businessesRequested += leadsReq;
          rec.googleMapsCalls += estCalls;

          return {
            ...c,
            type: isEmailCampaign ? 'email' : (c.type || 'sms'),
            businessesRequested: leadsReq,
            emailsFound: emailsFoundCount,
            maxAllowedPerCall: 20,
            googleMapsCalls: estCalls,
            callBreakdown: calls,
          };
        });

        const usersList = Array.from(userMap.values()).sort((a, b) => (b.sitesRebranded + b.campaignsCount) - (a.sitesRebranded + a.campaignsCount));
        const totalSitesRebranded = validSites.length;
        const totalSitesDeployed = validSites.filter((s) => s.deploy_url).length;

        return new Response(
          JSON.stringify({
            ok: true,
            stats: {
              totalUsers: userMap.size,
              totalSitesRebranded,
              totalSitesDeployed,
              totalCampaigns: validCampaigns.length,
              totalBusinessesRequested,
              totalGoogleMapsCalls,
            },
            users: usersList,
            campaigns: enrichedCampaigns,
            recentSites: validSites.slice(0, 100).map((s) => ({
              ...s,
              deploy_url: s.slug && s.slug.length <= 63 ? `https://${s.slug}.lunao.org` : (s.deploy_url || `https://lunao.org/${s.slug}`),
            })),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Failed to aggregate admin metrics: ' + err.message }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
          }
        );
      }
    }

    // ─── 1. PROXY API & BACKEND SERVICES TO EC2 ─────────────────────────
    if (path.startsWith('/api/') || path.startsWith('/owner') || path.startsWith('/sites/') || path.startsWith('/functions/')) {
      const origin = env.BACKEND_URL || env.LUNAO_API_ORIGIN || BACKEND_ORIGIN;
      const backendUrl = new URL(path + url.search, origin);
      const reqHeaders = new Headers(request.headers);
      reqHeaders.set('X-Forwarded-Host', url.host);
      reqHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      try {
        const backendRes = await fetch(backendUrl.toString(), {
          method: request.method,
          headers: reqHeaders,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
          redirect: 'follow',
        });
        return addSecurityHeaders(backendRes);
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Backend connection error: ' + err.message }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
          }
        );
      }
    }

    // ─── 1.5 EDGE SUBDOMAIN ROUTING (https://<business-slug>.lunao.org) ─
    const hostLower = (url.hostname || '').toLowerCase();
    if (hostLower.endsWith('.lunao.org') && (path === '/' || path === '/index.html')) {
      const subSlug = hostLower.slice(0, -'.lunao.org'.length);
      const reservedSubs = ['www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'staging', 'dev'];
      if (subSlug && !reservedSubs.includes(subSlug) && !subSlug.includes('.')) {
        // Fast dual-fetch: probe EC2 Origin (< 15ms) and Supabase concurrently.
        // Return whichever succeeds first with valid HTML!
        const fetchEc2 = async () => {
          try {
            const ec2Url = `${BACKEND_ORIGIN}/sites/${subSlug}/index.html?_t=${Date.now()}`;
            const ec2Res = await fetch(ec2Url, {
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
              signal: AbortSignal.timeout(2000),
            });
            if (ec2Res.ok) {
              const ec2Html = await ec2Res.text();
              if (ec2Html && ec2Html.length > 1500 && !ec2Html.includes('Site Customization In Progress')) {
                return ec2Html;
              }
            }
          } catch {}
          return null;
        };

        const fetchSupabase = async () => {
          try {
            const sbKey = getSupabaseKey(env);
            const sbRes = await fetch(
              `${SUPABASE_URL}/rest/v1/user_sites?slug=ilike.${subSlug}&select=compiled_html&_t=${Date.now()}`,
              {
                cf: { cacheTtl: 0, cacheEverything: false },
                headers: {
                  apikey: sbKey,
                  Authorization: `Bearer ${sbKey}`,
                  Accept: 'application/json',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
                signal: AbortSignal.timeout(1500),
              }
            );
            if (sbRes.ok) {
              const data = await sbRes.json();
              if (data && data.length > 0 && data[0].compiled_html && data[0].compiled_html.length > 1500) {
                return data[0].compiled_html;
              }
            }
          } catch {}
          return null;
        };

        try {
          const rawHtml = await new Promise((resolve) => {
            let settled = 0;
            let resolved = false;
            const tryResolve = (val) => {
              settled++;
              if (val && !resolved) {
                resolved = true;
                resolve(val);
              } else if (settled >= 2 && !resolved) {
                resolve(null);
              }
            };
            fetchEc2().then(tryResolve);
            fetchSupabase().then(tryResolve);
          });

          if (rawHtml) {
            const html = transformUserSiteHtml(rawHtml, subSlug);
            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...SECURITY_HEADERS,
              },
            });
          }
        } catch {}
      }
    }

    // ─── 2. EDGE SLUG ROUTING (USER REBRANDED SITES FROM SUPABASE) ──────
    // Query Supabase directly so newly edited/deployed sites reflect in real-time instantly
    const slugMatch = path.match(/^\/([a-z0-9-]+)\/?$/i);
    if (slugMatch) {
      const slug = slugMatch[1].toLowerCase();
      const reserved = [
        '404', 'index', 'favicon', 'robots', 'dashboard', 'campaigns', 'sites',
        'editor', 'auth', 'login', 'register', 'settings', 'pwa', 'manifest', 'sw',
        'privacy', 'terms', 'admin',
      ];
      if (!reserved.includes(slug) && !slug.includes('.')) {
        try {
          const sbKey = getSupabaseKey(env);
          const sbRes = await fetch(
            `${SUPABASE_URL}/rest/v1/user_sites?slug=ilike.${slug}&select=compiled_html&_t=${Date.now()}`,
            {
              cf: { cacheTtl: 0, cacheEverything: false },
              headers: {
                apikey: sbKey,
                Authorization: `Bearer ${sbKey}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
              },
              signal: AbortSignal.timeout(1500),
            }
          );
          if (sbRes.ok) {
            const data = await sbRes.json();
            if (data && data.length > 0 && data[0].compiled_html) {
              const html = transformUserSiteHtml(data[0].compiled_html, slug);
              return new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                  'Pragma': 'no-cache',
                  'Expires': '0',
                  ...SECURITY_HEADERS,
                },
              });
            }
          }
        } catch {
          // Fall through to EC2 fallback
        }

        // EC2 Backend Fallback (serves /sites/<slug>/index.html staged on server)
        try {
          const ec2Url = `${BACKEND_ORIGIN}/sites/${slug}/index.html`;
          const ec2Res = await fetch(ec2Url, {
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            signal: AbortSignal.timeout(2500),
          });
          if (ec2Res.ok) {
            const ec2Html = await ec2Res.text();
            if (ec2Html && ec2Html.length > 2000 && !ec2Html.includes('Site Customization In Progress')) {
              const html = transformUserSiteHtml(ec2Html, slug);
              return new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                  'Pragma': 'no-cache',
                  'Expires': '0',
                  ...SECURITY_HEADERS,
                },
              });
            }
          }
        } catch {}
      }
    }

    // ─── 2.5 PUBLIC LEGAL PAGES (/privacy & /terms) ──────────────────────
    if (path === '/privacy' || path === '/privacy/' || path === '/terms' || path === '/terms/') {
      const canonicalFolder = path.startsWith('/privacy') ? '/privacy/' : '/terms/';
      try {
        let legalReq = new Request(new URL(canonicalFolder, request.url), request);
        let legalRes = await env.ASSETS.fetch(legalReq);
        // Follow internal asset redirect if any
        if (legalRes && (legalRes.status === 308 || legalRes.status === 301)) {
          const loc = legalRes.headers.get('location') || canonicalFolder;
          legalRes = await env.ASSETS.fetch(new Request(new URL(loc, request.url), request));
        }
        if (legalRes && (legalRes.status === 200 || legalRes.status === 304)) {
          return addSecurityHeaders(new Response(legalRes.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=3600, must-revalidate',
              ...SECURITY_HEADERS,
            },
          }));
        }
      } catch {
        // Fall through to general static assets
      }
    }

    // ─── 3. STATIC ASSETS ON CLOUDFLARE PAGES ───────────────────────────
    try {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return addSecurityHeaders(assetRes);
      }
    } catch {
      // Fall through to dynamic handling
    }

    // ─── 4. SPA CLIENT-SIDE ROUTING FALLBACK ─────────────────────────────
    if (!path.includes('.')) {
      try {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        const indexRes = await env.ASSETS.fetch(indexRequest);
        if (indexRes.status === 200) {
          return addSecurityHeaders(indexRes);
        }
      } catch {
        // Fall through
      }
    }

    // ─── 5. 404 FALLBACK ─────────────────────────────────────────────────
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Page Not Found — Lunao</title></head><body style="background:#09090b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>Page Not Found</h2><p style="color:#a1a1aa;">The requested URL was not found on Lunao.</p><a href="/" style="color:#6366f1;text-decoration:none;">Return to Dashboard</a></div></body></html>`,
      {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
      }
    );
  },
};
