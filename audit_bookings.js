const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
console.log('=== TEMPLATE BOOKING AUDIT ===\n');

files.forEach(f => {
  const content = fs.readFileSync(path.join('public', f), 'utf8');
  const hasBridge = content.includes('lunao-booking-bridge.js');
  const hasModal = content.includes('bookingModal') || content.includes('openBookingModal') || content.includes('bookingStep');
  
  if (hasBridge || hasModal) {
    console.log(`✅ [HAS REAL BOOKINGS] ${f} (Bridge: ${hasBridge}, Modal: ${hasModal})`);
  } else {
    console.log(`❌ [NO REAL BOOKINGS] ${f}`);
  }
});
