import fs from 'fs';

const c = fs.readFileSync('live-summit.html', 'utf8');

const patterns = [
  'hashchange',
  'popstate',
  'pushState',
  'replaceState',
  'setInterval',
  'setTimeout',
  'requestAnimationFrame',
  'location',
  'reload'
];

for (const p of patterns) {
  const matches = (c.match(new RegExp(p, 'g')) || []).length;
  console.log(`${p}: ${matches} occurrences`);
}
