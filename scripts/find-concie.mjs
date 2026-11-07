import fs from 'fs';

const c = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

// Find occurrences of "CONCIE"
let pos = 0;
while ((pos = c.indexOf('CONCIE', pos)) !== -1) {
  console.log('CONCIE found around index', pos);
  console.log(c.slice(Math.max(0, pos - 100), Math.min(c.length, pos + 100)));
  pos += 6;
}
