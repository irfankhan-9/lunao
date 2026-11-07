import https from 'https';

const checks = [
  { url: 'https://lunao.org/favicon.svg', type: 'image/svg+xml' },
  { url: 'https://lunao.org/favicon.ico', type: 'image/x-icon' },
  { url: 'https://lunao.org/owner/icon.svg', type: 'image/svg+xml' },
  { url: 'https://lunao.org/owner/manifest.json', type: 'application/json' },
  { url: 'https://lunao.org/summit-befrnfarber-hub-austin/', type: 'text/html' },
  { url: 'https://lunao.org/', type: 'text/html' }
];

for (const c of checks) {
  https.get(c.url, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`URL: ${c.url}`);
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Content-Type: ${res.headers['content-type']}`);
      console.log(`  Length: ${body.length}`);
      if (c.url.includes('icon.svg')) {
        console.log(`  Contains #2563EB?: ${body.includes('#2563EB')}`);
        console.log(`  Contains white L path?: ${body.includes('fill="#FFFFFF"')}`);
      }
      if (c.url.includes('manifest.json')) {
        console.log(`  Theme color: ${body.includes('#2563EB') ? '#2563EB' : 'other'}`);
      }
      if (c.type === 'text/html') {
        console.log(`  Has favicon link?: ${body.includes('rel="icon"') || body.includes("rel='icon'")}`);
      }
    });
  });
}
