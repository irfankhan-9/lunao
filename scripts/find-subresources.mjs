import fs from 'fs';

const html = fs.readFileSync('live-summit.html', 'utf8');

const linkRegex = /<(?:link|script|img)[^>]*(?:src|href)="([^"]*)"/gi;
let m;
const resources = new Set();
while ((m = linkRegex.exec(html)) !== null) {
  resources.add(m[1]);
}

console.log('Subresources in HTML:');
for (const r of resources) {
  console.log('  ', r);
}
