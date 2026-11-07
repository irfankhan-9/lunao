import https from 'https';

function trace(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`${url} -> Status: ${res.statusCode}`);
      if (res.headers.location) {
        console.log(`  Redirect to: ${res.headers.location}`);
      }
      resolve();
    }).on('error', err => {
      console.error(err.message);
      resolve();
    });
  });
}

await trace('https://lunao-web-designn.pages.dev/summit-befrnfarber-hub-austin');
await trace('https://lunao-web-designn.pages.dev/summit-befrnfarber-hub-austin/');
await trace('https://lunao-web-designn.pages.dev/');
await trace('https://lunao-web-designn.pages.dev/dashboard');
await trace('https://lunao-web-designn.pages.dev/sw.js');
