import https from 'https';

https.get('https://lunao.org/', res => {
  console.log('Status:', res.statusCode);
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('Body Length:', body.length);
    console.log('Has meta refresh?:', body.includes('meta http-equiv="refresh"'));
    console.log('Has window.location.replace?:', body.includes('window.location.replace'));
    console.log('Has root div?:', body.includes('<div id="root"></div>'));
    console.log('Has bundle script?:', body.includes('assets/index-'));
    console.log('HTML snippet:\n', body.slice(0, 400));
  });
});
