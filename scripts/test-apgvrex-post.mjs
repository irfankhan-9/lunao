const res = await fetch('https://lunao.org/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug: 'apgvrex-hvac-group-austin',
    customerName: 'Test Client',
    phone: '+15125550198',
    service: 'heating-repair'
  })
});
console.log('Status:', res.status);
const data = await res.json();
console.log('Response:', data);
