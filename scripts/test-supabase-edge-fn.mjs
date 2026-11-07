import fs from 'fs';
const res = await fetch('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'apgvrex-hvac-group-austin', customerName: 'Test', phone: '+15125550198' })
});
console.log('public-bookings status:', res.status);
const text = await res.text();
console.log('public-bookings response:', text);

const resLeads = await fetch('https://wqlbuadknltsjfzrltpe.supabase.co/functions/v1/public-leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'apgvrex-hvac-group-austin', customerName: 'Test', phone: '+15125550198' })
});
console.log('public-leads status:', resLeads.status);
const textLeads = await resLeads.text();
console.log('public-leads response:', textLeads);
