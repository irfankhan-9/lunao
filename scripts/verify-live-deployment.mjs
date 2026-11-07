import https from 'https';

const urls = [
  'https://lunao-web-designn.pages.dev/summit-befrnfarber-hub-austin/',
  'https://lunao-web-designn.pages.dev/barber-template-03.html',
  'https://lunao-web-designn.pages.dev/salon-template-02.html',
  'https://lunao-web-designn.pages.dev/gym-template-02.html',
  'https://lunao-web-designn.pages.dev/hvac-template-02.html',
  'https://lunao-web-designn.pages.dev/sw.js'
];

async function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const hasVeilActive = data.includes('class="page-transition-veil active"');
        const hasDisplayNone = data.includes('display: none !important');
        const hasSwError = data.includes("navigator.serviceWorker.register('/sw.js')");
        const isSwJs = url.endsWith('sw.js');
        const contentType = res.headers['content-type'] || '';
        
        console.log(`\nURL: ${url}`);
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Content-Type: ${contentType}`);
        console.log(`  Size: ${(data.length / 1024).toFixed(1)} KB`);
        if (!isSwJs) {
          console.log(`  Has active veil: ${hasVeilActive} (Should be false)`);
          console.log(`  Has display: none veil: ${hasDisplayNone} (Should be true)`);
          console.log(`  Has sw.js registration: ${hasSwError} (Should be false)`);
        } else {
          console.log(`  Is valid JS: ${contentType.includes('javascript') || data.includes('self.addEventListener')}`);
        }
        resolve();
      });
    }).on('error', err => {
      console.error(`Error fetching ${url}:`, err.message);
      resolve();
    });
  });
}

for (const u of urls) {
  await checkUrl(u);
}
console.log('\n✔ All live checks finished.');
