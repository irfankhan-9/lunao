import fs from 'fs';
import path from 'path';

// Ensure sw.js is in dist/
fs.copyFileSync('public/sw.js', 'dist/sw.js');
console.log('✓ Copied sw.js to dist/sw.js');

// Ensure sites/ are in dist/
fs.cpSync('sites', 'dist', { recursive: true });
console.log('✓ Copied sites/ into dist/');

// Also copy preview html files into dist/
const previewFiles = [
  'hvac-template-02.html',
  'barber-template-03.html',
  'salon-template-02.html',
  'gym-template-02.html'
];
for (const file of previewFiles) {
  if (fs.existsSync(`public/${file}`)) {
    fs.copyFileSync(`public/${file}`, `dist/${file}`);
    console.log(`✓ Copied public/${file} to dist/${file}`);
  }
}
