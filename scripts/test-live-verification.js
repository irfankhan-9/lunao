async function verifyLive() {
  console.log('=== Step 1: Verify Bridge on Cloudflare Pages ===');
  const bridgeRes = await fetch('https://lunao-web-designn.pages.dev/lunao-booking-bridge.js?ts=' + Date.now());
  const bridgeText = await bridgeRes.text();
  console.log('Bridge Status:', bridgeRes.status);
  console.log('Bridge Size:', bridgeText.length);
  console.log('Bridge contains "public-bookings":', bridgeText.includes('public-bookings'));
  console.log('Bridge contains "run.app":', bridgeText.includes('run.app'));
  console.log('Bridge contains "wqlbuadknltsjfzrltpe":', bridgeText.includes('wqlbuadknltsjfzrltpe'));
  console.log('Bridge contains "/api/bookings":', bridgeText.includes('/api/bookings'));

  console.log('\n=== Step 2: Verify Site summigvet-rfrb-austin on Cloudflare Pages ===');
  const siteRes = await fetch('https://lunao-web-designn.pages.dev/summigvet-rfrb-austin/?ts=' + Date.now());
  const siteHtml = await siteRes.text();
  console.log('Site Status:', siteRes.status);
  console.log('Site Size:', siteHtml.length);
  console.log('Site contains "run.app":', siteHtml.includes('run.app'));
  console.log('Site contains "wqlbuadknltsjfzrltpe":', siteHtml.includes('wqlbuadknltsjfzrltpe'));
  console.log('Site contains "/api/bookings":', siteHtml.includes('/api/bookings'));
  console.log('Site contains "/lunao-booking-bridge.js":', siteHtml.includes('lunao-booking-bridge.js'));

  console.log('\n=== Step 3: Test Booking Submission via Same-Origin Endpoint ===');
  const idempotencyKey = 'test-idemp-' + Date.now();
  const bookingPayload = {
    slug: 'summigvet-rfrb-austin',
    customerName: 'Marcus Vance',
    phone: '5125559876',
    email: 'marcus.vance@example.com',
    service: 'Emergency HVAC Repair',
    date: '2026-11-15',
    time: '02:00 PM',
    notes: 'AC blowing warm air in server room'
  };

  const bookingRes = await fetch('https://lunao-web-designn.pages.dev/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(bookingPayload)
  });

  console.log('Booking POST Status:', bookingRes.status);
  const bookingData = await bookingRes.json();
  console.log('Booking POST Response:', bookingData);

  console.log('\n=== Step 4: Verify Idempotent Duplicate Submission ===');
  const dupRes = await fetch('https://lunao-web-designn.pages.dev/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(bookingPayload)
  });
  console.log('Duplicate POST Status (should be 200 or 201):', dupRes.status);
  const dupData = await dupRes.json();
  console.log('Duplicate POST Response:', dupData);
  console.log('Duplicate returned same booking ID?', dupData.booking?.id === bookingData.booking?.id);

  console.log('\n=== Step 5: Test skyvault-builders-inc-calgary Booking Submission ===');
  const skyPayload = {
    slug: 'skyvault-builders-inc-calgary',
    customerName: 'Elena Rostova',
    phone: '4035552345',
    email: 'elena@skyvault-client.com',
    service: 'General Consultation',
    date: '2026-11-20',
    time: '11:00 AM',
    notes: 'Residential remodel inquiry'
  };

  const skyRes = await fetch('https://lunao-web-designn.pages.dev/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': 'sky-' + Date.now()
    },
    body: JSON.stringify(skyPayload)
  });

  console.log('Skyvault Booking POST Status:', skyRes.status);
  const skyData = await skyRes.json();
  console.log('Skyvault Booking POST Response:', skyData);
}

verifyLive().catch(console.error);
