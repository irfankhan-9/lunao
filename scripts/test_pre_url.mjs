async function testPreUrl() {
  const preUrl = 'https://ais-pre-g3eqvrjyk7ivct6g6iyvyz-570409437174.asia-southeast1.run.app/api/bookings';
  console.log('Testing OPTIONS preflight on Shared App URL:', preUrl);
  try {
    const res = await fetch(preUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://lunao-web-designn.pages.dev',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Idempotency-Key'
      }
    });

    console.log('Preflight Response Status:', res.status);
    console.log('Preflight Access-Control-Allow-Origin:', res.headers.get('access-control-allow-origin'));
    console.log('Preflight Access-Control-Allow-Methods:', res.headers.get('access-control-allow-methods'));

    if (res.status === 204 || res.status === 200) {
      console.log('✅ PREFLIGHT PASSED! Shared App URL accepts cross-origin preflight without redirecting!');
    } else {
      console.error('❌ Status:', res.status);
    }
  } catch (err) {
    console.error('❌ Preflight Exception:', err.message);
  }
}

testPreUrl();
