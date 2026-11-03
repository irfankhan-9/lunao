import { supabaseListBookings } from '../server/lib/supabase.js';

console.log('=== LUNAO COMPLETE PRODUCTION VALIDATION SUITE ===\n');

// 1. Redeem token for Tenant 1 (summigvet-rfrb-austin)
console.log('1. Authenticating as Owner for summigvet-rfrb-austin...');
const auth1Res = await fetch('http://127.0.0.1:8787/api/owner/redeem', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'summigvet-rfrb-austin' })
});
const auth1 = await auth1Res.json();
if (!auth1.ok || !auth1.token) throw new Error('Failed to auth tenant 1');
console.log('   Authenticated successfully. Token minted.');

// 2. Submit a brand new booking via /api/bookings (as customer would from rebranded site)
const testTimestamp = Date.now();
const testClientName = 'Sarah Jenkins ' + testTimestamp.toString().slice(-4);
const testClientEmail = 'sarah_' + testTimestamp + '@testdomain.com';
const testClientPhone = '5125550199';

console.log(`\n2. Submitting customer booking from website for ${testClientName}...`);
const bookRes = await fetch('http://127.0.0.1:8787/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug: 'summigvet-rfrb-austin',
    name: testClientName,
    email: testClientEmail,
    phone: testClientPhone,
    service: 'Emergency HVAC Diagnostic',
    date: '2026-11-29',
    time: '2:30 PM',
    notes: 'AC blowing warm air'
  })
});
const bookData = await bookRes.json();
console.log('   Booking API status:', bookRes.status);
console.log('   Created booking ID:', bookData.id);
if (!bookData.ok || !bookData.id) throw new Error('Booking submission failed');

// 3. Verify customer instantly appears in Owner PWA /api/pwa/:slug/customers
console.log('\n3. Verifying customer appears immediately in Owner PWA Customers section...');
const custRes = await fetch('http://127.0.0.1:8787/api/pwa/summigvet-rfrb-austin/customers', {
  headers: { 'Authorization': `Bearer ${auth1.token}` }
});
const custData = await custRes.json();
console.log('   PWA Customers HTTP status:', custRes.status);
const foundCustomer = custData.customers?.find(c => c.name === testClientName || c.email === testClientEmail);
console.log('   Customer found in PWA:', Boolean(foundCustomer));
if (!foundCustomer) throw new Error('Customer did not appear in PWA customers endpoint!');
console.log(`   Customer details: Name="${foundCustomer.name}", Phone="${foundCustomer.phone}", Service="${foundCustomer.lastService}"`);

// 4. Owner marks booking as "completed"
console.log(`\n4. Owner marks booking #${bookData.id} as "completed"...`);
const patchRes = await fetch(`http://127.0.0.1:8787/api/pwa/summigvet-rfrb-austin/bookings/${bookData.id}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth1.token}`
  },
  body: JSON.stringify({ status: 'completed', notes: 'Completed diagnostic and recharged refrigerant' })
});
const patchData = await patchRes.json();
console.log('   PWA PATCH status:', patchRes.status);
console.log('   Returned status:', patchData.booking?.status);
if (patchData.booking?.status !== 'completed') throw new Error('Status was not updated to completed!');

// 5. Verify persistence in Supabase PostgreSQL
console.log('\n5. Verifying persistence directly in Supabase PostgreSQL...');
const sbRows = await supabaseListBookings('summigvet-rfrb-austin');
const sbRow = sbRows.find(r => r.id === bookData.id);
console.log('   Supabase record:', sbRow);
console.log('   Supabase status === "completed":', sbRow?.status === 'completed');
if (sbRow?.status !== 'completed') throw new Error('Supabase did not persist completed status!');

// 6. Strict Tenant Isolation Verification
console.log('\n6. Verifying strict tenant isolation across businesses...');
const auth2Res = await fetch('http://127.0.0.1:8787/api/owner/redeem', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'skyvault-builders-inc-calgary' })
});
const auth2 = await auth2Res.json();

const cust2Res = await fetch('http://127.0.0.1:8787/api/pwa/skyvault-builders-inc-calgary/customers', {
  headers: { 'Authorization': `Bearer ${auth2.token}` }
});
const cust2Data = await cust2Res.json();
const leak = cust2Data.customers?.find(c => c.name === testClientName || c.email === testClientEmail);
console.log('   Customer leaked to skyvault-builders-inc-calgary?', Boolean(leak));
if (leak) throw new Error('CRITICAL TENANT LEAK DETECTED!');

// Cross-tenant access rejection test
const crossTenantRes = await fetch('http://127.0.0.1:8787/api/pwa/skyvault-builders-inc-calgary/customers', {
  headers: { 'Authorization': `Bearer ${auth1.token}` }
});
console.log('   Cross-tenant token forbidden test (expected 403):', crossTenantRes.status);
if (crossTenantRes.status !== 403) throw new Error('Cross-tenant unauthorized access was not blocked with 403!');

console.log('\n======================================================');
console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY (100% PRODUCTION READY)!');
console.log('======================================================');
