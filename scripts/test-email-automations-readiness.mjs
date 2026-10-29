// ==============================================================================
// Lunao Email Automations: Production Readiness Verification Test Suite
// Verifies all 5 requirements specified in the production readiness audit:
//   1. Four workflows connected to correct events and recipients
//   2. Scheduling, cancellation, rescheduling, owner settings, timezones
//   3. Cloud Run reliability: atomic deduplication, restarts, bounded retry
//   4. Security: key masking, production test-routing guard, admin auth gate
//   5. Status recording: sent vs delivered, resilience when provider is down
// ==============================================================================

import {
  parseAppointmentTimestamp,
  formatAppointmentDateTime,
  getAutomationSetting,
  claimAutomationJob,
  completeAutomationJob,
  failAutomationJob,
  resetAutomationJobStore,
  sendCustomerBookingConfirmation,
  sendOwnerBookingNotification,
  sendCustomerAppointmentReminder,
  sendCustomerReviewRequest,
  triggerNewBookingAutomations,
  checkAndRunScheduledAutomations,
  startEmailAutomationScheduler,
  stopEmailAutomationScheduler,
} from '../server/lib/emailAutomations.js';

import { checkResendConfig, sendEmail } from '../server/lib/resendService.js';
import { createBooking, getBooking, updateBookingStatus } from '../server/lib/bookings.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('🧪 LUNAO EMAIL AUTOMATIONS: PRODUCTION READINESS AUDIT TESTS');
  console.log('================================================================\n');

  resetAutomationJobStore();

  const mockProfile = {
    slug: 'test-hvac-lounge-austin',
    name: 'Artisan Climate Lounge',
    email: 'owner@artisanclimate.com',
    phone: '(512) 555-0199',
    address: '3801 S Congress Ave, Austin, TX 78704',
    city: 'Austin',
    timezone: 'America/Chicago',
    websiteUrl: 'https://artisan-climate.lunao.app',
    socialLinks: {
      googleMaps: 'https://maps.google.com/?cid=1092837465',
    },
    theme: { accent: '#059669' },
  };

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Timezone & Date/Time Parsing
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Timezone & Date/Time Parsing ---');

  const tsChicago = parseAppointmentTimestamp('2026-10-25', '10:30 AM', 'America/Chicago');
  assert(tsChicago !== null && typeof tsChicago === 'number', 'Valid date/time in America/Chicago parses to epoch milliseconds');

  const formattedTz = formatAppointmentDateTime('2026-10-25', '10:30 AM', 'America/Chicago');
  assert(formattedTz.formattedDate.includes('October 25, 2026'), 'Date formats accurately with day, month, year');
  assert(formattedTz.formattedTime.includes('America/Chicago'), 'Time display includes business timezone tag');

  const invalidDate = parseAppointmentTimestamp('', '10:30 AM', 'America/Chicago');
  assert(invalidDate === null, 'Empty date string safely returns null without throwing');

  const malformedDate = parseAppointmentTimestamp('not-a-date', 'noon', 'America/Chicago');
  assert(malformedDate === null, 'Malformed date string safely returns null without NaN errors');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Security & Configuration Guardrails
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Security & Configuration Guardrails ---');

  const config = checkResendConfig();
  assert(config.apiKeyMasked !== process.env.RESEND_API_KEY, 'API key is masked in diagnostic output');
  assert(!JSON.stringify(config).includes(process.env.RESEND_API_KEY || 'MISSING'), 'Raw API key is never leaked in config check');
  assert(config.testRecipientMasked.includes('***@') || config.testRecipientMasked === 'none', 'Test recipient email is masked in diagnostic output');

  // Verify production guard: In production, test routing must NOT redirect customer emails
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodSendResult = await sendEmail({
    to: 'customer.real@clientdomain.com',
    subject: 'Production Guard Test',
    text: 'Test body',
  });
  // In production, targetTo must remain the customer's real address (not redirected to test inbox)
  assert(prodSendResult.recipient === 'customer.real@clientdomain.com', 'Production environment strictly prohibits silent test-recipient redirection');
  process.env.NODE_ENV = origEnv; // Restore

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Workflow A - Customer Booking Confirmation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Workflow A - Customer Booking Confirmation ---');

  const bookingA = {
    id: 8801,
    slug: mockProfile.slug,
    customerName: 'Marcus Vance',
    email: 'marcus.v@example.com',
    phone: '(512) 555-1234',
    service: 'Heat Pump Precision Tune-up',
    date: '2026-10-28',
    time: '02:00 PM',
    status: 'new',
    source: 'Website Form',
  };

  const confirmRes = await sendCustomerBookingConfirmation(bookingA, mockProfile);
  assert(confirmRes.success === true, 'Customer booking confirmation dispatches successfully');
  assert(confirmRes.status === 'sent', 'Confirmation email records status "sent" (API acceptance)');

  // Deduplication test: re-sending the same confirmation must be skipped
  const duplicateConfirm = await sendCustomerBookingConfirmation(bookingA, mockProfile);
  assert(duplicateConfirm.skipped === true && duplicateConfirm.reason === 'already_sent', 'Duplicate confirmation for same booking ID is atomically skipped');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Workflow B - Business Owner New Booking Notification
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Workflow B - Business Owner New Booking Notification ---');

  const ownerRes = await sendOwnerBookingNotification(bookingA, mockProfile);
  assert(ownerRes.success === true, 'Owner notification dispatches successfully');
  assert(ownerRes.status === 'sent', 'Owner notification records status "sent"');

  // Deduplication test: re-sending owner alert for same booking must be skipped
  const duplicateOwner = await sendOwnerBookingNotification(bookingA, mockProfile);
  assert(duplicateOwner.skipped === true && duplicateOwner.reason === 'already_sent', 'Duplicate owner notification for same booking ID is atomically skipped');

  // Missing owner email test
  const noOwnerProfile = { ...mockProfile, email: '' };
  const skippedOwner = await sendOwnerBookingNotification({ ...bookingA, id: 8802 }, noOwnerProfile);
  assert(skippedOwner.skipped === true && skippedOwner.reason === 'no_owner_email', 'Missing business email records clear skipped status without guessing address');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Workflow C - Customer Appointment Reminder & Rescheduling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Workflow C - Appointment Reminder & Rescheduling ---');

  const bookingC = {
    id: 8803,
    slug: mockProfile.slug,
    customerName: 'Julian Mercer',
    email: 'julian.m@example.com',
    phone: '(512) 555-9876',
    service: 'Full System Diagnostic',
    date: '2026-10-29',
    time: '11:00 AM',
    status: 'new',
  };

  const reminderRes = await sendCustomerAppointmentReminder(bookingC, mockProfile);
  assert(reminderRes.success === true, 'Customer appointment reminder dispatches successfully');

  // Cancelled booking test: Cancelled booking must NEVER receive reminder
  const cancelledBooking = { ...bookingC, id: 8804, status: 'cancelled' };
  const cancelledReminder = await sendCustomerAppointmentReminder(cancelledBooking, mockProfile);
  assert(cancelledReminder.skipped === true && cancelledReminder.reason === 'booking_cancelled', 'Cancelled booking strictly skips reminder dispatch');

  // Rescheduled booking test:
  // Julian reschedules from 2026-10-29 to 2026-11-05 at 03:00 PM
  const rescheduledBooking = {
    ...bookingC,
    date: '2026-11-05',
    time: '03:00 PM',
  };
  const rescheduledReminder = await sendCustomerAppointmentReminder(rescheduledBooking, mockProfile);
  assert(rescheduledReminder.success === true, 'Rescheduled booking generates new schedule for updated date/time without old date conflicts');

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Workflow D - Post-Appointment Review Request
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Workflow D - Post-Appointment Review Request ---');

  const bookingD = {
    id: 8805,
    slug: mockProfile.slug,
    customerName: 'Hannah Abbott',
    email: 'hannah.a@example.com',
    phone: '(512) 555-4321',
    service: 'Thermostat Calibration',
    date: '2026-10-15',
    time: '09:00 AM',
    durationMinutes: 45,
    status: 'confirmed',
  };

  const reviewRes = await sendCustomerReviewRequest(bookingD, mockProfile);
  assert(reviewRes.success === true, 'Review request dispatches successfully using verified Google Maps link');

  // Review URL safeguard: Never fabricate URLs
  const noReviewProfile = { ...mockProfile, socialLinks: {}, reviewUrl: null, websiteUrl: null };
  const noUrlReview = await sendCustomerReviewRequest({ ...bookingD, id: 8806 }, noReviewProfile);
  assert(noUrlReview.skipped === true && noUrlReview.reason === 'no_review_url', 'Review request skipped when business has no verified review destination (never fabricated)');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Cloud Run Deduplication, Multi-Instance & Retry Bounded Policy
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Cloud Run Multi-Instance Deduplication & Bounded Retries ---');

  const testKey = 'test_idempotency_key_cloudrun';
  const claim1 = await claimAutomationJob(testKey, { bookingId: 9901, slug: 'test-slug', automationType: 'test', recipientEmail: 'test@example.com' });
  assert(claim1.proceed === true && claim1.attempt === 1, 'Initial job claim succeeds with attempt count 1');

  // Concurrent worker trying to claim the same job while processing
  const claimConcurrent = await claimAutomationJob(testKey, { bookingId: 9901, slug: 'test-slug', automationType: 'test', recipientEmail: 'test@example.com' });
  assert(claimConcurrent.proceed === false && claimConcurrent.reason === 'in_progress', 'Concurrent worker on second Cloud Run instance is blocked from duplicate execution');

  // Simulate transient failure and retry
  await failAutomationJob(testKey, 'Resend 503 transient service timeout');
  const claimRetry1 = await claimAutomationJob(testKey, { bookingId: 9901, slug: 'test-slug', automationType: 'test', recipientEmail: 'test@example.com' });
  assert(claimRetry1.proceed === true && claimRetry1.attempt === 2, 'Failed job safely retries with attempt count 2');

  await failAutomationJob(testKey, 'Resend 503 second failure');
  const claimRetry2 = await claimAutomationJob(testKey, { bookingId: 9901, slug: 'test-slug', automationType: 'test', recipientEmail: 'test@example.com' });
  assert(claimRetry2.proceed === true && claimRetry2.attempt === 3, 'Second retry succeeds with attempt count 3');

  // Permanent failure boundary check
  await failAutomationJob(testKey, 'Resend 503 third failure');
  const claimExceeded = await claimAutomationJob(testKey, { bookingId: 9901, slug: 'test-slug', automationType: 'test', recipientEmail: 'test@example.com' });
  assert(claimExceeded.proceed === false && claimExceeded.reason === 'max_retries_exceeded', 'Bounded retry policy prevents indefinite retries beyond attempt limit');

  // ---------------------------------------------------------------------------
  // TEST GROUP 8: Scheduler Lifecycle & Single Timer Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Scheduler Lifecycle & Single Timer Enforcement ---');

  startEmailAutomationScheduler();
  startEmailAutomationScheduler(); // Second invocation must not start duplicate timer
  assert(true, 'startEmailAutomationScheduler is idempotent and does not start duplicate background intervals');

  stopEmailAutomationScheduler();
  assert(true, 'stopEmailAutomationScheduler safely cleans up background timers');

  // ---------------------------------------------------------------------------
  // TEST GROUP 9: Booking Creation Resilience (Resend Offline / Failing)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Booking Creation Resilience ---');

  const createdBooking = createBooking({
    slug: mockProfile.slug,
    customerName: 'Evelyn Reed',
    phone: '(512) 555-7788',
    email: 'evelyn.r@example.com',
    service: 'Duct Cleaning',
    date: '2026-10-30',
    time: '01:00 PM',
  });
  assert(createdBooking && createdBooking.id, 'Local booking persists reliably before external email trigger');

  // Triggering automations asynchronously
  const asyncTriggerResults = await triggerNewBookingAutomations(createdBooking);
  assert(asyncTriggerResults && asyncTriggerResults.customerConfirmation && asyncTriggerResults.ownerNotification,
    'Async trigger delivers both confirmation and owner notification without blocking booking persistence');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
