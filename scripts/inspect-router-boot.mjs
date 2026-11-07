import fs from 'fs';

const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

// Look at the bottom of the script
const bottom = html.slice(html.lastIndexOf('<script'));
console.log('Script bottom length:', bottom.length);
console.log(bottom.slice(Math.max(0, bottom.length - 2000)));
