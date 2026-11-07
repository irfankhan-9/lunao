import fs from 'fs';

const c = fs.readFileSync('public/templates-raw/hvac-template-02.html', 'utf8');
const idx = c.indexOf('lunao-fab-mobile-lock');
if (idx !== -1) {
  console.log('Found at:', idx);
  console.log(c.slice(idx - 20, idx + 700));
} else {
  console.log('NOT FOUND in templates-raw/hvac-template-02.html');
}
