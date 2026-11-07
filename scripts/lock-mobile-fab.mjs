import fs from 'fs';

const files = [
  'public/templates-raw/hvac-template-02.html',
  'public/templates-raw/hvac-bespoke.html',
  'public/templates-raw/hvac-template.html',
  'public/hvac-template-02.html',
  'hvac-template-02.html',
  'public/hvac-bespoke.html',
  'hvac-bespoke.html',
  'public/templates-raw/barber-template-03.html',
  'public/barber-template-03.html',
  'barber-template-03.html',
  'public/templates-raw/salon-template-02.html',
  'public/salon-template-02.html',
  'salon-template-02.html',
  'public/templates-raw/dentist-template-02.html',
  'public/dentist-template-02.html',
  'dentist-template-02.html',
  'public/templates-raw/gym-template-02.html',
  'public/gym-template-02.html',
  'gym-template-02.html',
  'public/templates-raw/roofing-template-02.html',
  'public/roofing-template-02.html',
  'roofing-template-02.html',
];

const lock = `<style id="lunao-fab-mobile-lock">
@media (max-width: 900px) {
  .atelier-concierge-fab-container { bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important; right: 16px !important; }
  .atelier-concierge-fab { width: 48px !important; height: 48px !important; min-width: 48px !important; max-width: 48px !important; padding: 0 !important; border-radius: 50% !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 0 !important; box-shadow: 0 8px 24px rgba(61, 43, 31, 0.2), 0 0 16px rgba(184, 134, 11, 0.28) !important; overflow: hidden !important; }
  .atelier-concierge-fab .fab-label-text, .atelier-concierge-fab .fab-chevron, .atelier-concierge-fab span:not(.brand-spinner-icon) { display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; font-size: 0 !important; line-height: 0 !important; opacity: 0 !important; pointer-events: none !important; }
  .atelier-concierge-fab .brand-spinner-icon { font-size: 1.45rem !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }
}
</style>`;

files.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    if (!c.includes('id="lunao-fab-mobile-lock"')) {
      c = c.replace('</head>', lock + '\n</head>');
      fs.writeFileSync(f, c, 'utf8');
      console.log('Injected lock into:', f);
    } else {
      console.log('Already locked:', f);
    }
  }
});
