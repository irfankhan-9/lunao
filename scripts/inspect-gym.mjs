import fs from 'fs';
const c = fs.readFileSync('public/gym-template-01.html', 'utf8');
const idx = c.indexOf('lead-form');
console.log(c.slice(idx - 100, idx + 1800));
