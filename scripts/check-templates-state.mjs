import fs from 'fs';

for (const t of ['public/templates-raw/hvac-template-02.html', 'public/templates-raw/barber-template-03.html', 'public/templates-raw/salon-template-02.html', 'public/templates-raw/gym-template-02.html']) {
  if (fs.existsSync(t)) {
    const c = fs.readFileSync(t, 'utf8');
    console.log(t);
    console.log('  has active veil:', c.includes('class="page-transition-veil active"'));
    console.log('  veil style display none:', c.includes('.page-transition-veil { display: none !important;'));
    console.log('  has register sw.js:', c.includes("navigator.serviceWorker.register('/sw.js')"));
  }
}
