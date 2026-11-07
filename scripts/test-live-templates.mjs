const endpoints = [
  'https://lunao-web-designn.pages.dev/barber-template-03.html',
  'https://lunao-web-designn.pages.dev/salon-template-02.html',
  'https://lunao-web-designn.pages.dev/dentist-template-02.html',
  'https://lunao-web-designn.pages.dev/gym-template-02.html',
  'https://lunao-web-designn.pages.dev/roofing-template-02.html',
  'https://lunao.org/irfan-kh-cedar-park/'
];

for (const url of endpoints) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    const hasLock = text.includes('id="lunao-fab-mobile-lock"');
    const hasPlaceholder = /\{\{[A-Z0-9_]+\}\}/.test(text);
    console.log(url.split('/').pop() || url, '-> Status:', r.status, '| Lock:', hasLock, '| Leftover Brackets:', hasPlaceholder, '| Size:', text.length);
  } catch (err) {
    console.error(url, err.message);
  }
}
