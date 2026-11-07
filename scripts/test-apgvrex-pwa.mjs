import { isPwaActiveForSlugAsync } from './server/lib/inviteCodes.js';
const res = await isPwaActiveForSlugAsync('apgvrex-hvac-group-austin');
console.log('apgvrex-hvac-group-austin isPwaActive?:', res);

const r = await fetch('http://127.0.0.1:8787/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'apgvrex-hvac-group-austin', customerName: 'Test', phone: '+15125550198' })
});
console.log('localhost:8787 status:', r.status, await r.json());

