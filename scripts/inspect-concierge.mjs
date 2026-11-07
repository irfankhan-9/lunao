import fs from 'fs';

const html = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');
const lines = html.split('\n');
console.log('Total lines:', lines.length);

lines.forEach((l, idx) => {
  if (l.toLowerCase().includes('concier') && (l.includes('<button') || l.includes('class=') || l.includes('dock') || l.includes('dock-btn'))) {
    console.log(`${idx + 1}: ${l.trim().slice(0, 120)}`);
  }
});
