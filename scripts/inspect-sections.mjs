import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

const regex = /<section[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/section>/g;
let m;
while ((m = regex.exec(master)) !== null) {
  const id = m[1];
  const content = m[2];
  const h1_2 = content.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/);
  console.log(`Section id="${id}": ${h1_2 ? h1_2[1].replace(/<[^>]+>/g, '').trim().slice(0, 60) : '(no heading)'}`);
}
