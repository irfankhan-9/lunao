// Create ngrok tunnel using the npm package API (no local agent needed)
import('ngrok').then(async ({ default: ngrok }) => {
  console.log('Connecting to ngrok...');
  await ngrok.kill(); // kill any existing session

  const url = await ngrok.connect({
    addr: 8787,
    authtoken: '34IHSOHlmSiaRbm54Htfu2ljqup_5NcZeF4HSqq5SNYGTJpkq',
    host_header: 'localhost',
  });

  console.log('');
  console.log('🎉 LIVE TUNNEL URL:');
  console.log(url);
  console.log('');

  // Also get the API URL for inspection
  const apiUrl = await ngrok.getApi();
  console.log('ngrok API:', apiUrl);

  // Keep the tunnel alive
  console.log('');
  console.log('Tunnel is LIVE. Press Ctrl+C to stop.');
  // Write URL to a file for easy access
  const { writeFileSync } = await import('fs');
  writeFileSync('ngrok-url.txt', url);
  console.log('URL saved to ngrok-url.txt');
}).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
