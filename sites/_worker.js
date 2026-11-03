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
const SUPABASE_KEY =
  (typeof env !== 'undefined' && (env.SUPABASE_SECRET_KEY || env.SUPABASE_KEY)) ||
  (typeof atob === 'function' ? atob('c2Jfc2VjcmV0X1lJREpNaG1JSTlyaTJ2Q2JaSWdHUmdfSWFMNXhLd2Y=') : '');

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

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

    // ─── 2. EDGE SLUG ROUTING (USER REBRANDED SITES FROM SUPABASE) ──────
    // Query Supabase directly so newly edited/deployed sites reflect in real-time instantly
    const slugMatch = path.match(/^\/([a-z0-9-]+)\/?$/i);
    if (slugMatch) {
      const slug = slugMatch[1].toLowerCase();
      const reserved = [
        '404', 'index', 'favicon', 'robots', 'dashboard', 'campaigns', 'sites',
        'editor', 'auth', 'login', 'register', 'settings', 'pwa', 'manifest', 'sw',
      ];
      if (!reserved.includes(slug) && !slug.includes('.')) {
        try {
          const sbRes = await fetch(
            `${SUPABASE_URL}/rest/v1/user_sites?slug=eq.${slug}&select=compiled_html`,
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                Accept: 'application/json',
              },
            }
          );
          if (sbRes.ok) {
            const data = await sbRes.json();
            if (data && data.length > 0 && data[0].compiled_html) {
              let html = data[0].compiled_html;
              html = html.replace(/https:\/\/wqlbuadknltsjfzrltpe\.supabase\.co\/functions\/v1\/public-bookings/g, '/api/bookings');
              html = html.replace(/https:\/\/ais-dev-[^\/]+\.run\.app\/api\/bookings/g, '/api/bookings');
              html = html.replace(/\/functions\/v1\/public-bookings/g, '/api/bookings');
              return new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'public, max-age=0, must-revalidate',
                  ...SECURITY_HEADERS,
                },
              });
            }
          }
        } catch {
          // Fall through to static assets
        }
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
