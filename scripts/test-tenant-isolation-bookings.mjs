import http from 'node:http';
import assert from 'node:assert';

process.env.NO_SERVER_LISTEN = 'true';
process.env.NODE_ENV = 'development';

const { app } = await import('../server/index.js');
const { createBooking } = await import('../server/lib/bookings.js');

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

async function run() {
  console.log('Testing Tenant Isolation on /api/bookings endpoints...');

  // 1. Create a booking for Tenant A
  const bookingA = createBooking({
    slug: 'business-a-austin',
    customerName: 'Alice Secret Client',
    phone: '5125551111',
    email: 'alice@secret.com',
    service: 'Consultation',
    notes: 'Top Secret Notes'
  });
  console.log('Created Tenant A booking ID:', bookingA.id);

  // 2. User B logs in with their own token
  // User B queries Tenant A's slug
  const resRead = await fetch(`${baseUrl}/api/bookings?slug=business-a-austin`, {
    headers: {
      Authorization: 'Bearer mock-user-b'
    }
  });
  const dataRead = await resRead.json();
  console.log('User B GET /api/bookings?slug=business-a-austin status:', resRead.status);
  console.log('User B received bookings count:', dataRead.bookings?.length);
  const leakedBooking = dataRead.bookings?.find(b => b.id === bookingA.id);
  if (leakedBooking) {
    console.log('🚨 VULNERABILITY CONFIRMED: User B successfully read Tenant A booking:', leakedBooking.customerName, leakedBooking.phone);
  }

  // 3. User B calls GET /api/bookings with NO slug
  const resReadAll = await fetch(`${baseUrl}/api/bookings`, {
    headers: {
      Authorization: 'Bearer mock-user-b'
    }
  });
  const dataReadAll = await resReadAll.json();
  console.log('User B GET /api/bookings (unfiltered) count:', dataReadAll.bookings?.length);

  // 4. User B attempts to cancel Tenant A's booking
  const resPatch = await fetch(`${baseUrl}/api/bookings/${bookingA.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer mock-user-b'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  const dataPatch = await resPatch.json();
  console.log('User B PATCH /api/bookings/:id status:', resPatch.status);
  console.log('User B PATCH response:', dataPatch);
  if (resPatch.status === 200 && dataPatch.booking?.status === 'cancelled') {
    console.log('🚨 VULNERABILITY CONFIRMED: User B successfully cancelled Tenant A booking!');
  }

  server.close();
}

run().catch(console.error);
