import fs from 'fs';

const html = fs.readFileSync('live-summit.html', 'utf8');

const regex = /<script(?:\s+type="([^"]*)")?[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let count = 0;
while ((m = regex.exec(html)) !== null) {
  const type = m[1] || 'javascript';
  const code = m[2];
  count++;
  console.log(`Script #${count} (type=${type}, length=${code.length}):`);
  if (code.includes('while') || code.includes('for (') || code.includes('do {')) {
    console.log(`  Has loops!`);
    const lines = code.split('\n');
    lines.forEach((l, idx) => {
      if (/while\s*\(|for\s*\(|do\s*\{/.test(l)) {
        console.log(`    Line ${idx + 1}: ${l.trim().slice(0, 80)}`);
      }
    });
  }
}
