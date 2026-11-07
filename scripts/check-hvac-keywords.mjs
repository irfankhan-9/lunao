import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

const keywords = ['thermodynamic', 'climate', 'heat pump', 'air purity', 'slot diffuser', 'vrf', 'hvac', 'refrigerant'];
for (const kw of keywords) {
  const count = (master.match(new RegExp(kw, 'gi')) || []).length;
  console.log(`Keyword "${kw}": ${count} matches`);
}
