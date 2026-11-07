import fs from 'fs';
import path from 'path';

// Load raw barber template 03
const raw = fs.readFileSync('public/templates-raw/barber-template-03.html', 'utf8');

// Replace placeholders for Summit Barber Hub Austin
let html = raw;
const biz = {
  name: 'Summit Barber Hub',
  city: 'Austin, TX',
  state: 'TX',
  phone: '(512) 555-0488',
  phoneRaw: '5125550488',
  email: 'service@summitbarberhub.com',
  address: '3801 S Congress Ave, Austin, TX 78704'
};

html = html.replace(/\{\{BUSINESS_NAME\}\}/g, biz.name);
html = html.replace(/\{\{BUSINESS_NAME_SHORT\}\}/g, 'Summit');
html = html.replace(/\{\{CITY\}\}/g, biz.city);
html = html.replace(/\{\{STATE\}\}/g, biz.state);
html = html.replace(/\{\{PHONE_DISPLAY\}\}/g, biz.phone);
html = html.replace(/\{\{PHONE_RAW\}\}/g, biz.phoneRaw);
html = html.replace(/\{\{EMAIL\}\}/g, biz.email);
html = html.replace(/\{\{ADDRESS\}\}/g, biz.address);
html = html.replace(/\{\{YEARS_IN_BUSINESS\}\}/g, '2016');
html = html.replace(/\{\{GOOGLE_RATING\}\}/g, '4.9');
html = html.replace(/\{\{GOOGLE_REVIEW_COUNT\}\}/g, '388');
html = html.replace(/\{\{INSTAGRAM_HANDLE\}\}/g, 'summit_barber_austin');
html = html.replace(/\{\{FACEBOOK_URL\}\}/g, 'https://facebook.com/summitbarber');
html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');

// Ensure booking bridge is present
if (!html.includes('lunao-booking-bridge.js')) {
  html = html.replace('</body>', '<script src="/lunao-booking-bridge.js"></script>\n</body>');
}

// Write to sites/summit-befrnfarber-hub-austin/index.html
const siteDir = path.resolve('sites/summit-befrnfarber-hub-austin');
fs.mkdirSync(siteDir, { recursive: true });
fs.writeFileSync(path.join(siteDir, 'index.html'), html, 'utf8');
console.log('Recompiled summit-befrnfarber-hub-austin/index.html (' + (html.length / 1024).toFixed(1) + ' KB)');
