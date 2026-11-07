import { compileSite } from './server/lib/compile.js';

const biz = {
  name: 'Summit Magic Climate',
  city: 'Austin, TX',
  phone: '(512) 555-0999'
};

const res = await compileSite(biz, 'hvac-bespoke');
console.log('COMPILED HTML length:', res.html.length);
console.log('COMPILED contains fab-label-text:', res.html.includes('fab-label-text'));
console.log('COMPILED contains MOBILE CONCIERGE TOGGLE:', res.html.includes('MOBILE CONCIERGE TOGGLE'));
process.exit(0);
