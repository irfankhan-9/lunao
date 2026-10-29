import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
console.log('=== DETAILED TEMPLATE BOOKING AUDIT ===\n');

files.forEach(f => {
  const content = fs.readFileSync(path.join('public', f), 'utf8');
  const matches = content.match(/book|appointment|schedule|calendar|slot/gi) || [];
  console.log(`${f}: found ${matches.length} booking-related keywords`);
});
