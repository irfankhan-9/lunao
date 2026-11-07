import fs from 'fs';

const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');
const r2 = html.indexOf('route() {');
console.log(html.slice(r2 + 1000, r2 + 3500));
