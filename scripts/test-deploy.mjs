// Cloudflare-only live test: compile a couple of sites, stage them, and deploy
// to Cloudflare Pages. Sends NO SMS. Reads keys from .env.local via config.js.
import { compileSite } from '../server/lib/compile.js';
import { stageSite, publishBatch } from '../server/lib/cloudflare.js';
import { slugify } from '../server/lib/slug.js';
import { modeSummary } from '../server/lib/config.js';

const leads = [
  { name: 'Vintage Cuts Barber Lounge', city: 'Austin, TX', niche: 'barber', phone: '(512) 555-0182' },
  { name: 'Everest Climate Systems', city: 'Austin, TX', niche: 'hvac', phone: '(512) 555-0988' },
];

console.log('Mode:', modeSummary());

for (const biz of leads) {
  const slug = slugify(biz.name, biz.city);
  const { html } = await compileSite(biz, biz.niche);
  const url = await stageSite(slug, html);
  console.log(`staged: ${slug} -> ${url}`);
}

console.log('\nPublishing to Cloudflare Pages...');
const res = await publishBatch();
console.log('Result:', res);
