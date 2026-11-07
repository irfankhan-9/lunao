import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync('live-summit.html', 'utf8');

const regex = /<script(?:\s+type="([^"]*)")?[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let count = 0;
while ((m = regex.exec(html)) !== null) {
  const type = m[1] || 'javascript';
  const code = m[2];
  count++;
  if (type === 'javascript' && code.trim().length > 0) {
    try {
      new vm.Script(code);
      console.log(`Script #${count}: SYNTAX OK!`);
    } catch (e) {
      console.error(`Script #${count} ERROR:`, e.message);
    }
  }
}
