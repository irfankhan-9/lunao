import fs from 'fs';

function updateWorker(workerPath) {
  if (!fs.existsSync(workerPath)) return;
  let code = fs.readFileSync(workerPath, 'utf8');

  // 1. Add /sw.js kill switch
  if (!code.includes('0.1 SERVICE WORKER KILL SWITCH')) {
    const swRoute = `    // ─── 0.1 SERVICE WORKER KILL SWITCH ──────────────────────────────────
    if (path === '/sw.js') {
      const swKillSwitch = \`// Lunao Edge Service Worker - Immediate Self-Destruct Kill Switch
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll())
  );
});\`;
      return new Response(swKillSwitch, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          ...SECURITY_HEADERS,
        },
      });
    }

`;
    code = code.replace("    // ─── 0.5 ADMIN METRICS API", swRoute + "    // ─── 0.5 ADMIN METRICS API");
  }

  // 2. Add SW kill-switch and DOM hydration protection in Section 2
  const edgeDefenseMarker = "// Edge defense: inject SW unregister kill-switch";
  if (!code.includes(edgeDefenseMarker)) {
    const edgeReplacements = `              // Edge defense: inject SW unregister kill-switch into head
              if (!html.includes('id="sw-killswitch"')) {
                const swKillScript = \`<script id="sw-killswitch">
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function(regs) {
                      for (var i = 0; i < regs.length; i++) regs[i].unregister();
                    });
                  }
                </script>\`;
                if (html.includes('<head>')) {
                  html = html.replace('<head>', \`<head>\\n  \${swKillScript}\`);
                }
              }

              // Edge defense: neutralize any empty-string keys in hydrateDOMPlaceholders
              html = html.replace(/\\[\\s*''\\s*,\\s*business\\.[a-zA-Z0-9_]+\\s*\\]/g, "/* neutralized empty key */");
`;
    const searchTarget = "html = html.replace(/navigator\\.serviceWorker\\.register\\('\\/sw\\.js'\\)[\\s\\S]*?\\.catch\\(error => \\{[\\s\\S]*?\\}\\);/g, '/* sw disabled */');";
    code = code.replace(searchTarget, searchTarget + '\n\n' + edgeReplacements);
  }

  fs.writeFileSync(workerPath, code, 'utf8');
  console.log(`✅ Updated ${workerPath}`);
}

updateWorker('public/_worker.js');
if (fs.existsSync('dist/_worker.js')) updateWorker('dist/_worker.js');
