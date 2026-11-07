import fs from 'fs';

const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

const routerIdx = html.indexOf('const router = {');
if (routerIdx !== -1) {
  console.log(html.slice(routerIdx, routerIdx + 2500));
} else {
  console.log('router not found by "const router = {"');
  const r2 = html.indexOf('route() {');
  console.log(html.slice(r2 - 100, r2 + 1500));
}
