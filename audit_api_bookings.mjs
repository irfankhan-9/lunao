import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
console.log('=== API BOOKINGS CALL AUDIT ===\n');

files.forEach(f => {
  const content = fs.readFileSync(path.join('public', f), 'utf8');
  const hasApiBookings = content.includes('/api/bookings') || content.includes('lunao-booking');
  console.log(`${f}: ${hasApiBookings ? '✅ HAS API BOOKING INTEGRATION' : '❌ NO API BOOKING INTEGRATION'}`);
});
