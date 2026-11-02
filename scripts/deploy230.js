import { seedAndDeployAll230EdmontonSites } from '../server/lib/specialModeSites.js';
import { SITES_DIR } from '../server/lib/config.js';

async function main() {
  console.log('Starting full seeding and deployment for all 230 Edmonton contractor sites...');
  const result = await seedAndDeployAll230EdmontonSites(SITES_DIR);
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
