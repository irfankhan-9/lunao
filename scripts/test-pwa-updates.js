async function testPwaUpdates() {
  console.log('=== Step 1: Create a booking and test Mark Completed ===');
  const slug = 'summigvet-rfrb-austin';
  
  // 1. Submit a fresh booking
  const uniqueName = 'Teresa Morales ' + Date.now().toString().slice(-4);
  const uniquePhone = '512555' + Math.floor(1000 + Math.random() * 9000);
  const uniqueEmail = `teresa_${Date.now()}@example.com`;

  const bookingRes = await fetch('https://lunao-web-designn.pages.dev/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug,
      customerName: uniqueName,
      phone: uniquePhone,
      email: uniqueEmail,
      service: 'Complete Heat Pump Diagnostic',
      date: '2026-11-25',
      time: '03:30 PM',
      notes: 'Please check outdoor condenser unit'
    })
  });

  const bookingJson = await bookingRes.json();
  console.log('Booking Creation Status:', bookingRes.status, 'ID:', bookingJson.id);
  const bookingId = bookingJson.id;

  // 2. Test status transition to 'completed'
  // Direct PWA API call to update status to 'completed'
  console.log('\n=== Step 2: Testing status update to "completed" ===');
  const patchRes = await fetch(`http://51.21.181.63/api/bookings/${bookingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-owner-key': 'dev_admin_all_access'
    },
    body: JSON.stringify({ status: 'completed' })
  });

  console.log('Patch Status Response:', patchRes.status);
  const patchJson = await patchRes.json();
  console.log('Patch Result:', patchJson);
  console.log('Booking status is now "completed"?', patchJson.booking?.status === 'completed');

  // 3. Test customer derivation for this slug
  console.log('\n=== Step 3: Verify new client is instantly derived in Customers section ===');
  const custRes = await fetch(`http://51.21.181.63/api/pwa/${slug}/customers`, {
    headers: {
      'Authorization': 'Bearer dev_admin_all_access',
      'x-owner-key': 'dev_admin_all_access'
    }
  });

  console.log('Customers Endpoint Status:', custRes.status);
  const custJson = await custRes.json();
  const customers = custJson.customers || [];
  console.log(`Total customers for ${slug}:`, customers.length);
  
  const found = customers.find(c => c.name === uniqueName || c.email === uniqueEmail || c.phone === uniquePhone);
  console.log('Newly booked client found in customers list?', Boolean(found));
  if (found) {
    console.log('Found Customer Record:', {
      name: found.name,
      phone: found.phone,
      email: found.email,
      lastService: found.lastService,
      bookingCount: found.bookingCount
    });
  }

  // 4. Test strict tenant isolation
  console.log('\n=== Step 4: Strict Tenant Isolation Check ===');
  const otherSlug = 'skyvault-builders-inc-calgary';
  const otherCustRes = await fetch(`http://51.21.181.63/api/pwa/${otherSlug}/customers`, {
    headers: {
      'Authorization': 'Bearer dev_admin_all_access',
      'x-owner-key': 'dev_admin_all_access'
    }
  });

  const otherCustJson = await otherCustRes.json();
  const otherCustomers = otherCustJson.customers || [];
  const leaked = otherCustomers.find(c => c.name === uniqueName || c.email === uniqueEmail);
  console.log(`Client leaked to other tenant (${otherSlug})?`, Boolean(leaked));
  console.log('Tenant isolation strictly maintained?', leaked === undefined);
}

testPwaUpdates().catch(console.error);
