import fs from 'fs';

const c = fs.readFileSync('live-summit.html', 'utf8');
const idx = c.indexOf('setContainer(html, customTitle) {');
console.log(c.slice(idx, idx + 2500));
