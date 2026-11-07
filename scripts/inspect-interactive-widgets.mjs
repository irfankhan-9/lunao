import fs from 'fs';

const c = fs.readFileSync('live-summit.html', 'utf8');
const idx = c.indexOf('initInteractiveWidgets() {');
console.log(c.slice(idx, idx + 2500));
