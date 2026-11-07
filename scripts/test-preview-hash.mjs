import https from 'https';

const url = 'https://2f0d7e0f.lunao-web-designn.pages.dev/summit-befrnfarber-hub-austin/';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Length:', data.length);
    console.log('Has active veil:', data.includes('class="page-transition-veil active"'));
    console.log('Has sw.js register:', data.includes("navigator.serviceWorker.register('/sw.js')"));
    console.log('Has display: none on veil:', data.includes('display: none !important'));
  });
});
