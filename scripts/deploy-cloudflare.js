import 'dotenv/config';
import { publishBatch } from '../server/lib/cloudflare.js';

async function main() {
  console.log('=== Deploying to Cloudflare Pages via publishBatch() ===');
  const res = await publishBatch();
  console.log('Deployment Result:', res);
}
main().catch((err) => {
  console.error('Deploy error:', err);
  process.exit(1);
});
