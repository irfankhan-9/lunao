// Comprehensive Automated Test Suite: AI Billing, Pricing Registry, Model Adapters, & Supabase Ledger
import assert from 'node:assert/strict';
import {
  CANONICAL_MODELS,
  DEFAULT_MODEL_ID,
  getModelRates,
  calculateUsageCost,
  listStudioModels,
} from '../server/lib/ai/pricingRegistry.js';
import {
  reserveBudget,
  settleUsage,
  getUserAiStatus,
  listAiUsageLedger,
  PLAN_ALLOWANCES,
} from '../server/lib/ai/accountingService.js';
import { orchestrateAiEditStream, cleanHtmlOutput } from '../server/lib/ai/orchestrator.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`• ${name}... `);
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error('  Error:', err.message);
    failed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('  Lunao AI Studio Billing & Models Verification');
  console.log('====================================================\n');

  // 1. Model Registry
  await test('Verify 6 exact canonical models and default engine', async () => {
    const expected = [
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.1-pro-preview',
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-fable-5-1',
    ];
    for (const m of expected) {
      assert.ok(CANONICAL_MODELS[m], `Missing model: ${m}`);
    }
    assert.equal(DEFAULT_MODEL_ID, 'gemini-3.8-flash');
  });

  // 2. Versioned Pricing & Effective Date
  await test('Verify Gemini 3.8 Flash rate change on Jan 1, 2027', async () => {
    const rate2026 = await getModelRates('gemini-3.8-flash', new Date('2026-10-29T12:00:00Z'));
    assert.equal(rate2026.inputCostPerMillion, 0.075);
    assert.equal(rate2026.outputCostPerMillion, 0.30);

    const rate2027 = await getModelRates('gemini-3.8-flash', new Date('2027-01-02T00:00:00Z'));
    assert.equal(rate2027.inputCostPerMillion, 0.15);
    assert.equal(rate2027.outputCostPerMillion, 0.60);
  });

  // 3. Sub-Cent Math & 100 Credits = $1.00 USD
  await test('Verify exact sub-cent calculation without naive whole-credit round-up', async () => {
    // 1,000 input tokens, 2,000 output tokens on gemini-3.8-flash (2026 rate)
    // Input cost: 1000 * 0.075 / 1M = $0.000075
    // Output cost: 2000 * 0.30 / 1M = $0.000600
    // Total USD: $0.000675
    // Credits: 0.000675 * 100 = 0.0675 credits
    const cost = await calculateUsageCost(
      'gemini-3.8-flash',
      { inputTokens: 1000, outputTokens: 2000 },
      new Date('2026-10-29T12:00:00Z')
    );

    assert.equal(cost.totalCostUsd, 0.000675);
    assert.equal(cost.credits, 0.0675);
    // Crucial: Must NOT be rounded up to 1.0!
    assert.ok(cost.credits < 0.1, 'Credit cost should preserve decimal precision');
  });

  // 4. Authoritative Plan Allowances
  await test('Verify monthly AI allowances for all tiers', async () => {
    assert.deepEqual(PLAN_ALLOWANCES['Free Plan'], { monthlyUsd: 0.00, monthlyCredits: 0, priceUsd: 0 });
    assert.deepEqual(PLAN_ALLOWANCES['Starter Plan'], { monthlyUsd: 6.00, monthlyCredits: 600, priceUsd: 97 });
    assert.deepEqual(PLAN_ALLOWANCES['Pro Plan'], { monthlyUsd: 13.00, monthlyCredits: 1300, priceUsd: 187 });
    assert.deepEqual(PLAN_ALLOWANCES['Agency Plan'], { monthlyUsd: 20.00, monthlyCredits: 2000, priceUsd: 297 });
  });

  // 5. Preflight Reservation & Settlement
  await test('Verify atomic reservation and settlement in Supabase', async () => {
    const testUserId = `test_user_${Date.now()}`;
    const testReqId = `req_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // A. Preflight reservation
    const reserve = await reserveBudget({
      userId: testUserId,
      requestId: testReqId,
      modelId: 'gemini-3.8-flash',
      promptText: 'Build a premium dental lounge website in Austin, TX',
      maxOutputTokens: 8192,
    });

    assert.ok(reserve.ok, 'Reservation should succeed');
    assert.ok(reserve.reservedCredits > 0, 'Reservation credits should be > 0');
    assert.equal(reserve.model, 'gemini-3.8-flash');
    const balanceAfterReserve = reserve.remainingBalance;

    // B. Settlement with actual usage
    const settle = await settleUsage({
      requestId: testReqId,
      modelId: 'gemini-3.8-flash',
      tokenUsage: { inputTokens: 800, outputTokens: 2500 },
      latencyMs: 110,
      status: 'settled',
    });

    assert.ok(settle.ok, 'Settlement should succeed');
    assert.equal(settle.status, 'settled');
    assert.ok(settle.actualCredits > 0, 'Actual credits should be calculated');
    assert.ok(settle.refundedDelta !== undefined, 'Refund delta should be returned');
    assert.equal(settle.balanceAfter, balanceAfterReserve + settle.refundedDelta);

    // C. Idempotency check: settling the same requestId again should not double-settle
    const idempotentSettle = await settleUsage({
      requestId: testReqId,
      modelId: 'gemini-3.8-flash',
      tokenUsage: { inputTokens: 800, outputTokens: 2500 },
      status: 'settled',
    });
    assert.ok(idempotentSettle.ok, 'Idempotent call should return ok');
    assert.equal(idempotentSettle.idempotent, true);
  });

  // 6. Cancellation / Failure Refund
  await test('Verify full refund when generation fails or cancels', async () => {
    const testUserId = `test_user_${Date.now()}`;
    const testReqId = `req_fail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const reserve = await reserveBudget({
      userId: testUserId,
      requestId: testReqId,
      modelId: 'claude-sonnet-5-5',
      promptText: 'Design a bespoke barber studio in Miami',
    });

    const preBalance = reserve.remainingBalance;
    const reservedAmt = reserve.reservedCredits;

    const settleFail = await settleUsage({
      requestId: testReqId,
      modelId: 'claude-sonnet-5-5',
      status: 'failed',
      errorMessage: 'Simulated client abort',
    });

    assert.ok(settleFail.ok);
    assert.equal(settleFail.status, 'failed');
    assert.equal(settleFail.refundedCredits, reservedAmt);
    assert.equal(settleFail.newBalance, preBalance + reservedAmt);
  });

  // 7. Full Streaming Orchestration with Mock/Fallback
  await test('Verify orchestrateAiEditStream end-to-end with placeholder preservation', async () => {
    const testReqId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let chunksReceived = 0;

    const result = await orchestrateAiEditStream({
      html: '<html><body></body></html>',
      instruction: 'Build a luxury barbershop template for {{BUSINESS_NAME}} in {{CITY}}',
      model: 'gemini-3.8-flash',
      userId: `user_stream_test_${Date.now()}`,
      requestId: testReqId,
      onChunk: () => { chunksReceived++; },
    });

    assert.ok(chunksReceived > 0, 'Should stream chunks');
    assert.ok(result.html.includes('<!DOCTYPE html'), 'Should output valid DOCTYPE');
    assert.ok(result.html.includes('{{BUSINESS_NAME}}'), 'Must preserve {{BUSINESS_NAME}}');
    assert.ok(result.html.includes('{{CITY}}'), 'Must preserve {{CITY}}');
    assert.ok(result.metadata.creditsDeducted > 0, 'Should record deducted credits in metadata');
    assert.equal(result.metadata.requestId, testReqId);
  });

  // 8. HTML Sanitizer & Guard
  await test('Verify cleanHtmlOutput strictly validates and protects booking contract', async () => {
    const valid = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello World</h1><p>Test content spanning enough characters to satisfy the minimum length check for production single-file HTML websites.</p></body></html>';
    const cleaned = cleanHtmlOutput(valid);
    assert.ok(cleaned.includes('<!DOCTYPE html>'));

    // Test rejection of invalid incomplete markup
    assert.throws(() => {
      cleanHtmlOutput('Not valid html');
    }, /AI servers busy, try later/);
  });

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error('Test runner encountered fatal error:', err);
  process.exit(1);
});
