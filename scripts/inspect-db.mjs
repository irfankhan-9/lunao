const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const [sitesRes, smsRes] = await Promise.all([
  fetch(`${sbUrl}/rest/v1/user_sites?order=created_at.desc&limit=5`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  }),
  fetch(`${sbUrl}/rest/v1/sms_logs?order=created_at.desc&limit=5`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  }),
]);

const sites = await sitesRes.json();
const sms = await smsRes.json();
console.log('--- Supabase user_sites ---');
console.log(JSON.stringify(sites, null, 2));
console.log('--- Supabase sms_logs ---');
console.log(JSON.stringify(sms, null, 2));
