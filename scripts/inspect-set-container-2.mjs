import fs from 'fs';

const c = fs.readFileSync('live-summit.html', 'utf8');
const idx = c.indexOf('if (shouldRestoreScroll) {');
console.log(c.slice(idx, idx + 1800));
