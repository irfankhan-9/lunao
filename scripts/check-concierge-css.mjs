import fs from 'fs';

const c = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

// Search for concierge FAB html
const fabMatch = c.match(/<button[^>]*class="atelier-concierge-fab"[^>]*>[\s\S]*?<\/button>/);
console.log('FAB HTML:', fabMatch ? fabMatch[0] : 'Not found');

// Search for all media queries affecting atelier-concierge-fab
const regex = /@media[^{]+\{[\s\S]*?\.atelier-concierge-fab[\s\S]*?\}/g;
let m;
while ((m = regex.exec(c)) !== null) {
  console.log('--- Media query match: ---');
  console.log(m[0].slice(0, 300));
}
