import fs from 'fs';
const c = fs.readFileSync('public/hvac-bespoke.html', 'utf8');
const idx = c.indexOf('submitFeasibilityInquiry');
console.log(c.slice(idx + 1500, idx + 3500));
