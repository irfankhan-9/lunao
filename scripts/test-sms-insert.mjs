const sbUrl = process.env.SUPABASE_URL || 'https://wqlbuadknltsjfzrltpe.supabase.co';
const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

await fetch(`${sbUrl}/rest/v1/sms_logs?owner_key=eq.test_insert`, {
  method: 'DELETE',
  headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
});
console.log('Cleaned up test row');
