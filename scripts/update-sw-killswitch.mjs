import fs from 'fs';

const killSwitch = `// Lunao Edge Service Worker - Self-Destruct Kill Switch
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll();
    })
  );
});
`;

fs.writeFileSync('public/sw.js', killSwitch, 'utf8');
if (fs.existsSync('dist')) fs.writeFileSync('dist/sw.js', killSwitch, 'utf8');
fs.writeFileSync('sw.js', killSwitch, 'utf8');
console.log('✅ Service worker kill-switch written to public/sw.js, dist/sw.js, and sw.js');
