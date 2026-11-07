import fs from 'fs';

for (const p of ['dist/summit-befrnfarber-hub-austin/index.html', 'public/summit-befrnfarber-hub-austin/index.html', 'sites/summit-befrnfarber-hub-austin/index.html']) {
  if (fs.existsSync(p)) {
    const c = fs.readFileSync(p, 'utf8');
    console.log(p);
    console.log('  has active veil:', c.includes('class="page-transition-veil active"'));
    console.log('  has sw.js register:', c.includes("navigator.serviceWorker.register('/sw.js')"));
  } else {
    console.log(p, 'MISSING');
  }
}
