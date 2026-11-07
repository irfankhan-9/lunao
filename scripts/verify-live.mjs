import https from 'https';

https.get('https://lunao-web-designn.pages.dev/summit-befrnfarber-hub-austin/', res => {
  console.log('Site Status:', res.statusCode);
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('Body Length:', body.length);
    console.log('Has sw-killswitch in head?:', body.includes('id="sw-killswitch"'));
    console.log('Has empty string in replacements?:', body.includes("['', business."));
    console.log('Has safe walk function?:', body.includes("key && typeof key === 'string' && key.trim().length > 1"));
    console.log('Has mobile fab lock?:', body.includes('id="lunao-fab-mobile-lock"'));
    console.log('Has booking bridge?:', body.includes('lunao-booking-bridge.js'));
    console.log('Has veil active?:', body.includes('class="page-transition-veil active"'));
    console.log('Contains reload code?:', body.includes('location.reload()') || body.includes('window.location.reload()'));
  });
});
