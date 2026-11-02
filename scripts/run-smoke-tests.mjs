import { runSupabaseSmokeTest, runAiSmokeTests, getPgPool } from '../server/lib/supabaseClient.js';

console.log('🚀 Running Real Supabase & AI Smoke Tests...\n');

async function test() {
  console.log('1. Testing Supabase & Postgres Database Connection...');
  const dbRes = await runSupabaseSmokeTest();
  console.log('--- SUPABASE SMOKE TEST RESULT ---');
  console.log(JSON.stringify(dbRes, null, 2));

  console.log('\n2. Testing AI Models (Gemini & Anthropic)...');
  const aiRes = await runAiSmokeTests();
  console.log('--- AI SMOKE TEST RESULT ---');
  console.log(JSON.stringify(aiRes, null, 2));

  try {
    const pool = getPgPool();
    await pool.end();
  } catch {}

  process.exit(0);
}

test().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
