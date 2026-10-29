async function runSmokeTest() {
  const url = 'http://localhost:3000/api/bookings';
  const testPayload = {
    slug: 'vintage-cuts-austin',
    customerName: 'Test Client',
    phone: '(512) 555-9988',
    email: 'test.client@example.com',
    service: 'Classic Cut',
    date: '2026-10-25',
    time: '14:00',
    notes: 'Smoke test booking confirmation',
    source: 'form',
    businessName: 'Vintage Cuts Barber Lounge'
  };

  console.log('Sending smoke test booking POST to:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'smoke_' + Date.now()
      },
      body: JSON.stringify(testPayload)
    });

    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));

    if (res.ok && data.ok) {
      console.log('✅ Smoke Test PASSED: Booking API endpoint confirmed persistence successfully.');
    } else {
      console.error('❌ Smoke Test result:', data);
    }
  } catch (err) {
    console.error('❌ Smoke Test Exception:', err.message);
  }
}

runSmokeTest();
