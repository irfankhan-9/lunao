import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  const sb = createClient(supabaseUrl, supabaseKey);
  const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');
  const { data, error } = await sb.from('user_sites').update({ html }).eq('slug', 'summit-befrnfarber-hub-austin');
  if (error) {
    console.error('Supabase update error:', error.message);
  } else {
    console.log('✓ Successfully updated user_sites row in Supabase for summit-befrnfarber-hub-austin');
  }
}
