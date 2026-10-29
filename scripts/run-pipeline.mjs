#!/usr/bin/env node
// CLI runner for the real campaign pipeline — test the whole flow from a CSV
// without the dashboard.
//
//   node scripts/run-pipeline.mjs <leads.csv> [niche]
//   npm run pipeline -- sample-leads.csv barber
//
// Works today in dry-run (sites served locally, SMS simulated). The moment you
// add real keys to .env it deploys to Cloudflare Pages and texts via Telnyx.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../server/lib/csv.js';
import { runPipeline } from '../server/lib/pipeline.js';
import { modeSummary } from '../server/lib/config.js';

const [, , csvArg, nicheArg] = process.argv;

if (!csvArg) {
  console.error('Usage: node scripts/run-pipeline.mjs <leads.csv> [niche]');
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);
if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf8');
const businesses = parseCsv(csv);

if (!businesses.length) {
  console.error('No valid rows found in CSV (need at least a Name column).');
  process.exit(1);
}

const mode = modeSummary();
console.log('\n  LUNAO PIPELINE — live run');
console.log('  ─────────────────────────────────────────────');
console.log(`  Leads            : ${businesses.length}`);
console.log(`  Niche            : ${nicheArg || '(from CSV per-row)'}`);
console.log(`  Telnyx SMS       : ${mode.telnyx}`);
console.log(`  Cloudflare Pages : ${mode.cloudflare}`);
console.log(`  Site base URL    : ${mode.siteBaseUrl}`);
console.log('  ─────────────────────────────────────────────\n');

const icons = {
  'site:compiling': '⚙️ ',
  'site:generated': '✅',
  'site:failed': '❌',
  'deploy:start': '☁️ ',
  'deploy:done': '🚀',
  'deploy:error': '⚠️ ',
  'sms:sending': '📨',
  'sms:sent': '📱',
  'sms:failed': '❌',
  'sms:skipped': '⏭️ ',
};

function onEvent(e) {
  switch (e.type) {
    case 'site:generated':
      console.log(`${icons[e.type]} [${e.index}] ${e.name}  ->  ${e.siteUrl}`);
      break;
    case 'site:failed':
      console.log(`${icons[e.type]} [${e.index}] ${e.name}  -> COMPILE FAILED: ${e.error}`);
      break;
    case 'deploy:start':
      console.log(`\n${icons[e.type]} Publishing ${e.count} site(s)${e.live ? ' to Cloudflare Pages...' : ' (local dry-run)...'}`);
      break;
    case 'deploy:done':
      console.log(`${icons[e.type]} Deploy ${e.deployed ? 'live: ' + (e.deploymentUrl || 'done') : 'staged locally'}\n`);
      break;
    case 'deploy:error':
      console.log(`${icons[e.type]} Deploy error: ${e.error}\n`);
      break;
    case 'sms:sent':
      console.log(`${icons[e.type]} [${e.index}] ${e.name}  ${e.simulated ? '(SIMULATED)' : 'SENT'} -> ${e.to}`);
      break;
    case 'sms:failed':
      console.log(`${icons[e.type]} [${e.index}] ${e.name}  SMS FAILED: ${e.error}`);
      break;
    case 'sms:skipped':
      console.log(`${icons[e.type]} [${e.index}] ${e.name}  SMS skipped: ${e.reason}`);
      break;
    case 'sms:coming_soon':
      console.log(`🕒 [${e.index}] ${e.name}  SMS queued (COMING SOON) -> ${e.to || 'no phone'}`);
      break;
    default:
      break;
  }
}

const { summary } = await runPipeline({ businesses, niche: nicheArg, onEvent });

console.log('\n  ─────────────────────────────────────────────');
console.log('  CAMPAIGN COMPLETE');
console.log(`  Sites generated  : ${summary.sitesGenerated}/${summary.total}`);
console.log(`  SMS dispatched   : ${summary.smsSent}`);
console.log(`  SMS coming soon  : ${summary.smsComingSoon ?? 0}`);
console.log(`  Failures         : ${summary.failed}`);
console.log(`  Telnyx           : ${summary.telnyx}`);
console.log(`  Cloudflare       : ${summary.cloudflare}`);
console.log('  ─────────────────────────────────────────────\n');
