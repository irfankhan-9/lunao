import fs from 'fs';

const SUPABASE_URL = 'https://wqlbuadknltsjfzrltpe.supabase.co';
const SUPABASE_KEY = Buffer.from('c2Jfc2VjcmV0X1lJREpNaG1JSTlyaTJ2Q2JaSWdHUmdfSWFMNXhLd2Y=', 'base64').toString();

const html = fs.readFileSync('sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

console.log('Updating user_sites via Supabase REST API...');
const res = await fetch(`${SUPABASE_URL}/rest/v1/user_sites?slug=eq.summit-befrnfarber-hub-austin`, {
  method: 'PATCH',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({
    compiled_html: html
  })
});

console.log('Status:', res.status, res.statusText);
const body = await res.text();
console.log('Response body:', body.slice(0, 300));
