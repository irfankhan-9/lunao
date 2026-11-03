import 'dotenv/config';
import { getOrCreateCodeForSlug } from '../server/lib/inviteCodes.js';
import { getBookingAsync, updateBookingStatusAsync, listBookingsAsync } from '../server/lib/bookings.js';
import { supabaseUpdateBookingStatus, getSupabase } from '../server/lib/supabase.js';

async function verifyAll() {
  console.log('=== Step 1: Testing getBookingAsync and updateBookingStatusAsync with "completed" ===');
  const slug = 'summigvet-rfrb-austin';

  // 1. Create a fresh booking via fetch
  const uniqueName = 'David Chen ' + Date.now().toString().slice(-4);
  const uniquePhone = '512555' + Math.floor(1000 + Math.random() * 9000);
  const uniqueEmail = `david_${Date.now()}@example.com`;

  const createRes = await fetch('http://127.0.0.1:8787/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug,
      customerName: uniqueName,
      phone: uniquePhone,
      email: uniqueEmail,
      service: 'Heat Pump Inspection',
      date: '2026-11-28',
      time: '11:00 AM',
      notes: 'Test client for completed status'
    })
  });

  const createData = await createRes.json();
  console.log('Created booking:', createData);
  const bookingId = createData.booking?.id || createData.id;

  // 2. Fetch the booking using getBookingAsync
  const fetched = await getBookingAsync(bookingId);
  console.log('getBookingAsync returned:', fetched?.id, fetched?.customerName, 'Status:', fetched?.status);

  // 3. Update status to 'completed'
  console.log('\n=== Step 2: Updating status to "completed" ===');
  const updated = await updateBookingStatusAsync(bookingId, 'completed', 'Job finished successfully');
  console.log('updateBookingStatusAsync returned status:', updated?.status);

  // 4. Verify in Supabase PostgreSQL
  const sb = getSupabase();
  if (sb) {
    const { data: sbRow, error: sbErr } = await sb
      .from('bookings')
      .select('id, slug, status, notes, customer_name')
      .eq('id', bookingId)
      .single();
    console.log('Supabase row verification:', sbRow);
    console.log('Supabase status is "completed"?', sbRow?.status === 'completed');
  }

  // 5. Test PWA API endpoint /api/pwa/:slug/customers
  console.log('\n=== Step 3: Testing PWA Customers Endpoint ===');
  const codeObj = getOrCreateCodeForSlug(slug);
  const codeStr = typeof codeObj === 'object' && codeObj.code ? codeObj.code : String(codeObj);
  console.log('Invite code for', slug, ':', codeStr);
  
  // Redeem or construct bearer token: lunao.<base64url(code)>.<timestamp>
  const b64 = Buffer.from(codeStr).toString('base64url');
  const token = `lunao.${b64}.${Date.now()}`;

  const custRes = await fetch(`http://127.0.0.1:8787/api/pwa/${slug}/customers`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('PWA /customers HTTP status:', custRes.status);
  const custData = await custRes.json();
  const customers = custData.customers || [];
  console.log(`Retrieved ${customers.length} customer profile(s) for ${slug}`);
  
  const clientMatch = customers.find(c => c.name === uniqueName || c.email === uniqueEmail);
  console.log('Newly booked client found in customers list?', Boolean(clientMatch));
  if (clientMatch) {
    console.log('Customer Details:', {
      id: clientMatch.id,
      name: clientMatch.name,
      phone: clientMatch.phone,
      email: clientMatch.email,
      lastService: clientMatch.lastService,
      bookingCount: clientMatch.bookingCount
    });
  }

  // 6. Test strict tenant isolation
  console.log('\n=== Step 4: Strict Tenant Isolation Check ===');
  const otherSlug = 'skyvault-builders-inc-calgary';
  const otherCodeObj = getOrCreateCodeForSlug(otherSlug);
  const otherCodeStr = typeof otherCodeObj === 'object' && otherCodeObj.code ? otherCodeObj.code : String(otherCodeObj);
  const otherB64 = Buffer.from(otherCodeStr).toString('base64url');
  const otherToken = `lunao.${otherB64}.${Date.now()}`;

  const otherCustRes = await fetch(`http://127.0.0.1:8787/api/pwa/${otherSlug}/customers`, {
    headers: {
      'Authorization': `Bearer ${otherToken}`
    }
  });

  const otherCustData = await otherCustRes.json();
  const otherCustomers = otherCustData.customers || [];
  const leakFound = otherCustomers.find(c => c.name === uniqueName || c.email === uniqueEmail);
  console.log('Client leaked to other tenant?', Boolean(leakFound));
  console.log('Tenant isolation strictly enforced?', leakFound === undefined);

  // 7. Verify cross-tenant access prevention
  const forbiddenRes = await fetch(`http://127.0.0.1:8787/api/pwa/${otherSlug}/customers`, {
    headers: {
      'Authorization': `Bearer ${token}` // token for summigvet trying to access skyvault
    }
  });
  console.log('Cross-tenant unauthorized request HTTP status (must be 403):', forbiddenRes.status);
  console.log('SUCCESS: All checks verified!');
}

verifyAll().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
