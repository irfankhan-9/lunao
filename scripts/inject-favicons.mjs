import fs from 'fs';

const targetFiles = [
  'sites/summit-befrnfarber-hub-austin/index.html',
  'public/hvac-template-02.html',
  'hvac-template-02.html',
  'public/hvac-template.html',
  'hvac-template.html',
  'public/barber-template.html',
  'barber-template.html',
  'public/barber-template-02.html',
  'barber-template-02.html',
  'public/salon-template-01.html',
  'salon-template-01.html',
  'public/gym-template-01.html',
  'gym-template-01.html',
  'public/dentist-template-01.html',
  'dentist-template-01.html',
  'public/roofing-template-01.html',
  'public/realestate-template-01.html',
  'realestate-template-01.html'
];

const faviconSnippet = `  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n  <link rel="alternate icon" href="/favicon.ico" />`;

for (const f of targetFiles) {
  if (!fs.existsSync(f)) continue;
  let html = fs.readFileSync(f, 'utf8');
  if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n${faviconSnippet}`);
      fs.writeFileSync(f, html, 'utf8');
      console.log(`✅ Injected favicon into: ${f}`);
    }
  }
}
