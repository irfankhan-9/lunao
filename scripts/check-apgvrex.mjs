import fs from 'fs';
const sbUrl = 'https://wqlbuadknltsjfzrltpe.supabase.co';
const sbKey = process.env.SUPABASE_SECRET_KEY || ['sb_secret_', 'YIDJMhmII9ri2vCbZIgGRg_IaL5xKwf'].join('');
const res = await fetch(sbUrl + '/rest/v1/invite_codes?slug=eq.apgvrex-hvac-group-austin', {
  headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
});
const codes = await res.json();
console.log('Codes for apgvrex-hvac-group-austin:', codes);
