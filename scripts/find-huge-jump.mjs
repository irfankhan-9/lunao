import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');

let cur = master;
function testStep(name, fn) {
  const before = cur.length;
  cur = fn(cur);
  const after = cur.length;
  if (Math.abs(before - after) > 1000) {
    console.log(`HUGE JUMP at [${name}]: was ${before}, now ${after} (diff: ${before - after})`);
  }
}

testStep('heroDesc', h => h.replace(/\$\{.*?Ultra-quiet variable-speed heat pumps.*?delivered with guaranteed upfront pricing\.' : business\.description\}/s, 'HERO_DESC'));

testStep('manifestoP1', h => h.replace(/\$\{business\.name\} was established in \$\{business\.city\} to eliminate the traditional friction of loud compressors.*?under one accountable roof\./s, 'MANIFESTO_P1'));

testStep('manifestoP2', h => h.replace(/From day one, your property is guided by a licensed mechanical engineer.*?decay line tests\./s, 'MANIFESTO_P2'));

testStep('servicesData', h => h.replace(/const SERVICES_DATA = \[[\s\S]*?\];/s, 'SERVICES_DATA'));
testStep('barbersData', h => h.replace(/const BARBERS_DATA = \[[\s\S]*?\];/s, 'BARBERS_DATA'));
testStep('teamData', h => h.replace(/const TEAM_DATA = \[[\s\S]*?\];/s, 'TEAM_DATA'));
testStep('productsData', h => h.replace(/const PRODUCTS_DATA = \[[\s\S]*?\];/s, 'PRODUCTS_DATA'));
