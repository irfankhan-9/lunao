import fs from 'fs';

const files = [
  'hvac-template-02.html',
  'public/hvac-template-02.html',
  'public/templates-raw/hvac-template-02.html',
  'barber-template-03.html',
  'public/barber-template-03.html',
  'public/templates-raw/barber-template-03.html',
  'salon-template-02.html',
  'public/salon-template-02.html',
  'public/templates-raw/salon-template-02.html',
  'gym-template-02.html',
  'public/gym-template-02.html',
  'public/templates-raw/gym-template-02.html',
  'sites/summit-befrnfarber-hub-austin/index.html'
];

let allGood = true;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const isRaw = file.includes('templates-raw');

  // Check veil
  const hasActiveVeil = content.includes('class="page-transition-veil active"');
  const hasDisplayNone = content.includes('display: none !important');
  const hasSwRegister = content.includes("navigator.serviceWorker.register('/sw.js')");

  // Check placeholders
  const leftOverPlaceholders = (content.match(/\{\{[A-Z0-9_]+\}\}/g) || []).length;

  console.log(`\nChecking: ${file} (${(content.length / 1024).toFixed(1)} KB)`);
  console.log(`  - Has active veil: ${hasActiveVeil} (Should be false)`);
  console.log(`  - Has display: none on veil: ${hasDisplayNone} (Should be true)`);
  console.log(`  - Has sw.js register: ${hasSwRegister} (Should be false)`);
  console.log(`  - Leftover placeholders: ${leftOverPlaceholders} (${isRaw ? 'Expected > 0' : 'Must be 0'})`);

  if (hasActiveVeil || !hasDisplayNone || hasSwRegister) {
    allGood = false;
  }
  if (!isRaw && leftOverPlaceholders !== 0) {
    allGood = false;
  }
}

if (allGood) {
  console.log('\n\x1b[32m✔ ALL CHECKS PASSED PERFECTLY!\x1b[0m');
} else {
  console.log('\n\x1b[31m✖ SOME CHECKS FAILED!\x1b[0m');
}
