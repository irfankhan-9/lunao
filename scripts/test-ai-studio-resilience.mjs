// Automated Verification: AI Web Studio Resilience, HTML Repair, SSE Parsing & Non-Blocking Settlement
import assert from 'node:assert/strict';
import { cleanAndRepairHtmlOutput, cleanHtmlOutput } from '../server/lib/ai/orchestrator.js';
import { reserveBudget, settleUsage } from '../server/lib/ai/accountingService.js';
import { extractSseEvents, sanitizeAndRepairStreamHtml } from '../src/lib/aiStreamUtils.ts';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`• ${name}... `);
    await fn();
    console.log('PASS');
    passed++;
  } catch (err) {
    console.log('FAIL');
    console.error('  Error:', err?.stack || err?.message || err);
    failed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('  Lunao AI Web Studio Resilience Verification');
  console.log('====================================================\n');

  await test('cleanAndRepairHtmlOutput strips unclosed markdown fences and commentary', async () => {
    const raw = `Sure, here is your site:\n\`\`\`html\n<!DOCTYPE html><html><head><title>Test</title></head><body><section><h1>Hello World Business</h1></section></body></html>`;
    const { html, wasRepaired } = cleanAndRepairHtmlOutput(raw);
    assert.equal(wasRepaired, false);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.endsWith('</html>'));
    assert.ok(!html.includes('```'));
  });

  await test('cleanAndRepairHtmlOutput repairs truncated HTML missing </body></html>', async () => {
    const truncated =
      '<!DOCTYPE html><html><head><style>body{margin:0;color:#111} .hero{padding:40px}' +
      '</style></head><body><header><nav>Everest HVAC</nav></header>' +
      '<main><section class="hero"><h1>24/7 Heating & Cooling</h1><p>Fast service in Austin, TX.</p></section></main>' +
      '<footer class="incomplete';
    const { html, wasRepaired } = cleanAndRepairHtmlOutput(truncated);
    assert.equal(wasRepaired, true);
    assert.ok(html.includes('</body>'));
    assert.ok(html.endsWith('</html>'));
    assert.ok(!html.includes('<footer class="incomplete'));
    assert.equal(cleanHtmlOutput(truncated), html);
  });

  await test('cleanAndRepairHtmlOutput closes dangling <style> or <script> tags when truncated', async () => {
    const truncatedStyle =
      '<!DOCTYPE html><html><head><style>' + 'body{font-family:sans-serif;background:#fff}'.repeat(8);
    const { html, wasRepaired } = cleanAndRepairHtmlOutput(truncatedStyle + '</head><body><div>Content section here</div>');
    assert.equal(wasRepaired, true);
    assert.ok(html.includes('</body>'));
    assert.ok(html.endsWith('</html>'));
  });

  await test('cleanAndRepairHtmlOutput still rejects non-HTML or tiny junk', async () => {
    assert.throws(() => cleanAndRepairHtmlOutput('Sorry, I cannot help with that.'), /incomplete/i);
    assert.throws(() => cleanAndRepairHtmlOutput('<div>tiny</div>'), /incomplete/i);
  });

  await test('sanitizeAndRepairStreamHtml handles unclosed fence and truncated tail on client', async () => {
    const raw =
      '```html\n<!DOCTYPE html><html><head><title>Salon</title></head><body><main><section><h1>Luxe Hair Studio</h1><p>Modern styling and cuts in Dallas, TX.</p></section></main><div class="cut';
    const repaired = sanitizeAndRepairStreamHtml(raw);
    assert.ok(repaired.startsWith('<!DOCTYPE html>'));
    assert.ok(repaired.endsWith('</html>'));
    assert.ok(!repaired.includes('```'));
    assert.ok(!repaired.includes('<div class="cut'));
  });

  await test('extractSseEvents handles CRLF, split chunks, keepalives, and EOF done without trailing blank line', async () => {
    const chunk1 = ': keepalive\r\n\r\ndata: {"type":"start"}\r\n\r\ndata: {"type":"chunk","de';
    const r1 = extractSseEvents(chunk1, '', false);
    assert.equal(r1.events.length, 1);
    assert.equal(r1.events[0].type, 'start');

    const chunk2 = 'lta":"<h1>Hi</h1>"}\r\n\r\ndata: {"type":"done","html":"<!DOCTYPE html><html></html>"}';
    // Before flush, final done without trailing \n\n stays in remaining
    const r2 = extractSseEvents(chunk2, r1.remaining, false);
    assert.equal(r2.events.length, 1);
    assert.equal(r2.events[0].type, 'chunk');
    assert.ok(r2.remaining.includes('"done"'));

    // On EOF flush=true, final done event MUST be emitted
    const r3 = extractSseEvents('', r2.remaining, true);
    assert.equal(r3.events.length, 1);
    assert.equal(r3.events[0].type, 'done');
    assert.equal(r3.events[0].html, '<!DOCTYPE html><html></html>');
    assert.equal(r3.remaining, '');
  });

  await test('settleUsage with backgroundPersist=true settles immediately without blocking on slow network', async () => {
    const userId = `test_fast_settle_${Date.now()}`;
    const requestId = `req_fast_${Date.now()}`;
    await reserveBudget({
      userId,
      requestId,
      modelId: 'gemini-3.8-flash',
      promptText: 'Build a clean plumbing website',
      planHint: 'Starter Plan',
    });

    const t0 = Date.now();
    const res = await settleUsage({
      requestId,
      userId,
      modelId: 'gemini-3.8-flash',
      tokenUsage: { inputTokens: 1200, outputTokens: 3500 },
      latencyMs: 11200,
      status: 'settled',
      backgroundPersist: true,
    });
    const elapsed = Date.now() - t0;

    assert.ok(res.ok);
    assert.equal(res.status, 'settled');
    assert.ok(res.actualCredits > 0);
    assert.ok(elapsed < 500, `Expected backgroundPersist settleUsage < 500ms, took ${elapsed}ms`);
  });

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
