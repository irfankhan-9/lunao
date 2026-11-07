import https from 'https';

const slugs = [
  'barber-template-03',
  'salon-template-02',
  'gym-template-02',
  'hvac-template-02',
];

for (const slug of slugs) {
  const url = `https://lunao-web-designn.pages.dev/${slug}`;
  https.get(url, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      const leftoverPlaceholders = (body.match(/\{\{[A-Z0-9_-]+\}\}/g) || []).length;
      console.log(`URL: ${url}`);
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Length: ${body.length}`);
      console.log(`  Leftover Placeholders: ${leftoverPlaceholders}`);
      console.log(`  Has SW Kill Switch: ${body.includes('id="sw-killswitch"')}`);
      console.log(`  Has Safe Walk Guard: ${body.includes("key && typeof key === 'string' && key.trim().length > 1")}`);
      console.log(`  Has Veil Active: ${body.includes('class="page-transition-veil active"')}`);
    });
  });
}
