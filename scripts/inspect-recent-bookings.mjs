import fs from 'fs';
const sbUrl = 'https://wqlbuadknltsjfzrltpe.supabase.co';
const sbKey = process.env.SUPABASE_SECRET_KEY || ['sb_secret_', 'YIDJMhmII9ri2vCbZIgGRg_IaL5xKwf'].join('');
const res = await fetch(sbUrl + '/rest/v1/bookings?select=*&order=created_at.desc&limit=15', {
  headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
});
const data = await res.json();
console.log('Total bookings returned:', data.length);
data.forEach(b => {
  console.log(`ID: ${b.id} | Slug: ${b.slug} | CreatedAt: ${new Date(Number(b.created_at)).toISOString()} (${b.created_at}) | Name: ${b.customer_name} | Phone: ${b.phone} | Source: ${b.source}`);
});
