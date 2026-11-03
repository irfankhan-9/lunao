import 'dotenv/config';
import { getSupabase } from '../server/lib/supabase.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

async function sanitizeSites() {
  console.log('=== Lunao Site Booking URL Sanitizer ===');
  const supabase = getSupabase();
  if (!supabase) {
    console.error('ERROR: No Supabase client available. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  // 1. Sanitize user_sites in Supabase / PostgreSQL via HTTPS REST
  console.log('Fetching slugs from public.user_sites...');
  const { data: siteList, error: listErr } = await supabase
    .from('user_sites')
    .select('slug');

  if (listErr) {
    console.error('Failed to query user_sites list:', listErr);
    process.exit(1);
  }

  console.log(`Found ${siteList?.length || 0} site slug(s). Processing in batches...`);
  let updatedDbCount = 0;

  // Process sites one by one or in small batches to avoid statement timeout
  for (const s of siteList || []) {
    const { data: row, error: rowErr } = await supabase
      .from('user_sites')
      .select('slug, compiled_html')
      .eq('slug', s.slug)
      .single();

    if (rowErr || !row || !row.compiled_html) continue;

    let html = row.compiled_html;
    if (html.includes('public-bookings') || html.includes('run.app')) {
      html = html.replace(/https:\/\/wqlbuadknltsjfzrltpe\.supabase\.co\/functions\/v1\/public-bookings/g, '/api/bookings');
      html = html.replace(/https:\/\/ais-dev-[^\/]+\.run\.app\/api\/bookings/g, '/api/bookings');
      html = html.replace(/\/functions\/v1\/public-bookings/g, '/api/bookings');

      const { error: updErr } = await supabase
        .from('user_sites')
        .update({ compiled_html: html })
        .eq('slug', row.slug);

      if (updErr) {
        console.error(`Failed to update ${row.slug}:`, updErr);
      } else {
        updatedDbCount++;
        console.log(`[Sanitized DB] ${row.slug}`);
      }
    }
  }

  console.log(`Database update complete. ${updatedDbCount} row(s) sanitized.`);

  // 2. Sanitize static files in sites/ directory if present
  const SITES_DIR = path.resolve('sites');
  if (fsSync.existsSync(SITES_DIR)) {
    console.log(`Scanning local files in ${SITES_DIR}...`);
    const entries = await fs.readdir(SITES_DIR, { withFileTypes: true });
    let fileCount = 0;
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const indexPath = path.join(SITES_DIR, ent.name, 'index.html');
        if (fsSync.existsSync(indexPath)) {
          let content = await fs.readFile(indexPath, 'utf8');
          if (content.includes('public-bookings') || content.includes('run.app')) {
            content = content.replace(/https:\/\/wqlbuadknltsjfzrltpe\.supabase\.co\/functions\/v1\/public-bookings/g, '/api/bookings');
            content = content.replace(/https:\/\/ais-dev-g3eqvrjyk7ivct6g6iyvyz-570409437174\.asia-southeast1\.run\.app\/api\/bookings/g, '/api/bookings');
            content = content.replace(/\/functions\/v1\/public-bookings/g, '/api/bookings');
            await fs.writeFile(indexPath, content, 'utf8');
            fileCount++;
          }
        }
      }
    }
    console.log(`Sanitized ${fileCount} static HTML file(s) in ${SITES_DIR}.`);
  }

  // 3. Verify summigvet-rfrb-austin specifically
  const { data: checkData } = await supabase
    .from('user_sites')
    .select('slug, compiled_html')
    .eq('slug', 'summigvet-rfrb-austin')
    .single();

  if (checkData) {
    const sHtml = checkData.compiled_html;
    console.log('Verification for summigvet-rfrb-austin:');
    console.log(' - Has public-bookings?', sHtml.includes('public-bookings'));
    console.log(' - Has run.app?', sHtml.includes('run.app'));
    console.log(' - Has /api/bookings?', sHtml.includes('/api/bookings'));
  } else {
    console.log('Notice: summigvet-rfrb-austin not found in database.');
  }

  console.log('Sanitization routine finished.');
  process.exit(0);
}

sanitizeSites().catch((err) => {
  console.error('Fatal sanitizer error:', err);
  process.exit(1);
});
