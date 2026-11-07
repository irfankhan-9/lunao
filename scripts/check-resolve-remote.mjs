import { resolveTemplate, loadRawHtml } from './server/lib/templates.js';

const res = await resolveTemplate('hvac-bespoke');
console.log('RESOLVED:', JSON.stringify(res, null, 2));
const raw = await loadRawHtml(res);
console.log('RAW length:', raw.length);
console.log('RAW contains fab-label-text:', raw.includes('fab-label-text'));
console.log('RAW contains MOBILE CONCIERGE TOGGLE:', raw.includes('MOBILE CONCIERGE TOGGLE'));
process.exit(0);
