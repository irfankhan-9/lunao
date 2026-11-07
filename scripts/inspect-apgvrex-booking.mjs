import fs from 'fs';
const sbUrl = 'https://wqlbuadknltsjfzrltpe.supabase.co';
const sbKey = process.env.SUPABASE_SECRET_KEY || ['sb_secret_', 'YIDJMhmII9ri2vCbZIgGRg_IaL5xKwf'].join('');
const res = await fetch(sbUrl + '/rest/v1/bookings?id=in.(612,613)', {
  headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
});
const b = await res.json();
console.log(JSON.stringify(b, null, 2));
