import fs from 'fs';
const c = fs.readFileSync('public/hvac-bespoke.html', 'utf8');
const idx = c.indexOf('getBookingEndpoints()');
console.log(c.slice(idx, idx + 800));
