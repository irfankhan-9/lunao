import 'dotenv/config';
import { getSupabase } from '../server/lib/supabase.js';

async function main() {
  const sb = getSupabase();
  const { data } = await sb.from('user_sites').select('compiled_html').eq('slug', 'summigvet-rfrb-austin').single();
  const m = data?.compiled_html?.match(/.{0,60}public-bookings.{0,60}/g);
  console.log('Matches:', m);
}
main();
