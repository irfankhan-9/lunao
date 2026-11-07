import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');
const lines = master.split('\n');

const findings = [];
for (let i = 13170; i < 14500; i++) {
  const line = lines[i] || '';
  if (/climate|hvac|heat pump|inverter|diffuser|duct|refrigerant|mechanical|thermodynamic|cooling/i.test(line)) {
    findings.push({ lineNum: i + 1, text: line.trim() });
  }
}

console.log(`Found ${findings.length} HVAC-specific lines in router rendering methods.`);
findings.slice(0, 30).forEach(f => console.log(`${f.lineNum}: ${f.text.slice(0, 90)}`));
