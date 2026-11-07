import fs from 'fs';

const master = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');
const lines = master.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('renderHome(') || l.includes('renderServices(') || l.includes('renderAbout(') || l.includes('id="app"') || l.includes('id="mainContent"')) {
    console.log(`${idx + 1}: ${l.trim().slice(0, 100)}`);
  }
});
