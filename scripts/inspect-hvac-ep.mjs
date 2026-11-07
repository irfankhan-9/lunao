import fs from 'fs';
const c = fs.readFileSync('public/hvac-bespoke.html', 'utf8');
const idx = c.indexOf('getLeadEndpoints()');
console.log(c.slice(idx, idx + 800));
