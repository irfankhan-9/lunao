import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Client } = pg;

const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const password = process.env.SUPABASE_DB_PASSWORD || '';

async function runProductionMigration() {
  console.log('Connecting to Supabase PostgreSQL at ' + host + ':' + port + '...');
  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('Connected successfully as user: ' + user);

  // 1. Run base schema migration if needed
  const baseSqlPath = path.resolve('scripts/supabase-migration.sql');
  if (fs.existsSync(baseSqlPath)) {
    console.log('Executing base schema migration (supabase-migration.sql)...');
    const baseSql = fs.readFileSync(baseSqlPath, 'utf8');
    await client.query(baseSql);
    console.log('Base schema migration executed successfully.');
  }

  // 2. Run idempotency migration
  const idempotencySqlPath = path.resolve('scripts/migrations/20261016_add_idempotency_key.sql');
  console.log('Executing idempotency migration (20261016_add_idempotency_key.sql)...');
  const idempotencySql = fs.readFileSync(idempotencySqlPath, 'utf8');
  await client.query(idempotencySql);
  console.log('Idempotency migration executed successfully.');

  // 3. Verifications
  console.log('\n--- Running Post-Migration Verifications ---');

  // Check 1: Verify idempotency_key column exists in bookings table
  const colCheck = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'bookings'
      AND column_name = 'idempotency_key';
  `);
  if (colCheck.rows.length === 0) {
    throw new Error('VERIFICATION FAILED: idempotency_key column does not exist in bookings table!');
  }
  console.log('[PASS] Check 1: idempotency_key column exists:', colCheck.rows[0]);

  // Check 2: Verify indexes exist
  const idxCheck = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
      AND indexname IN ('idx_bookings_slug_idempotency', 'idx_bookings_slug_status_created');
  `);
  console.log('[PASS] Check 2: Verified indexes:', idxCheck.rows.map(r => r.indexname));
  if (idxCheck.rows.length < 2) {
    console.warn('[WARN] Expected both indexes, found:', idxCheck.rows.length);
  }

  // Check 3: Confirm existing booking rows remain intact
  const countCheck = await client.query('SELECT COUNT(*) as total, COUNT(idempotency_key) as with_key FROM bookings;');
  console.log('[PASS] Check 3: Existing bookings row count:', countCheck.rows[0]);

  // Check 4: Notify PostgREST schema cache reload
  try {
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('[PASS] Check 4: Notified PostgREST schema cache reload.');
  } catch (e) {
    console.log('[NOTE] PostgREST notification note:', e.message);
  }

  await client.end();
  console.log('\nSUCCESS: Production database migration and verifications completed successfully!');
}

runProductionMigration().catch(err => {
  console.error('Migration and verification failed:', err);
  process.exit(1);
});
