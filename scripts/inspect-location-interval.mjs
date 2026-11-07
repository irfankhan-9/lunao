import fs from 'fs';

const c = fs.readFileSync('live-summit.html', 'utf8');
const lines = c.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('setInterval') || l.includes('location')) {
    console.log(`${idx + 1}: ${l.trim().slice(0, 100)}`);
  }
});
