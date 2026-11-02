// Telnyx auth check — read-only. Confirms the API key works and the sender
// number / messaging profile are reachable. Sends NO SMS.
import { telnyx } from '../server/lib/config.js';

if (!telnyx.live) {
  console.log('Telnyx not configured (DRY-RUN).');
  process.exit(0);
}

const headers = { Authorization: `Bearer ${telnyx.apiKey}` };

const bal = await fetch('https://api.telnyx.com/v2/balance', { headers });
const balData = await bal.json().catch(() => ({}));
console.log('Balance check:', bal.status, bal.ok ? 'AUTH OK' : 'AUTH FAILED');
if (bal.ok) {
  console.log('  Balance:', balData?.data?.balance, balData?.data?.currency);
}

if (telnyx.messagingProfileId) {
  const mp = await fetch(
    `https://api.telnyx.com/v2/messaging_profiles/${telnyx.messagingProfileId}`,
    { headers },
  );
  const mpData = await mp.json().catch(() => ({}));
  console.log('Messaging profile:', mp.status, mp.ok ? 'FOUND' : 'NOT FOUND');
  if (mp.ok) console.log('  Name:', mpData?.data?.name, '| enabled:', mpData?.data?.enabled);
}

console.log('\nSender number:', telnyx.from);
