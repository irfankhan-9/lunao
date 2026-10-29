// scripts/db-migrate.mjs
// One-shot migration: reads the local SQLite database and bulk-inserts every
// row into the Postgres database referenced by $DATABASE_URL. Idempotent
// (ON CONFLICT DO NOTHING on PK collisions). Run with:
//
//   $env:DATABASE_URL = "postgresql://..."
//   npm run db:migrate
//
// If you have no local data yet (e.g. greenfield deploy), this is a no-op.
// The deployed app will create the schema itself on first boot.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

const SQLITE_PATH = path.resolve('server/.data/lunao.db');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_PATH)) {
  console.log(`No local SQLite at ${SQLITE_PATH}. Nothing to migrate.`);
  console.log('The deployed app will create the Postgres schema on first boot.');
  process.exit(0);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

const TABLES = [
  'users',
  'auth_tokens',
  'bookings',
  'chat_sessions',
  'chat_messages',
  'site_addons',
  'invite_codes',
  'credit_accounts',
  'credit_ledger',
  'campaigns',
  'campaign_leads',
  'sms_logs',
  'sms_inbound',
  'template_categories',
  'custom_templates',
  'site_history',
];

let totalRows = 0;

for (const table of TABLES) {
  let rows;
  try {
    rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  } catch (e) {
    console.log(`[skip] ${table}: ${e.message}`);
    continue;
  }
  if (!rows.length) {
    console.log(`[skip] ${table}: empty`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      await client.query(sql, values);
    }
    await client.query('COMMIT');
    console.log(`[ok]   ${table}: ${rows.length} rows`);
    totalRows += rows.length;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`[err]  ${table}: ${e.message}`);
  } finally {
    client.release();
  }
}

sqlite.close();
await pool.end();

console.log(`\nMigration complete. ${totalRows} rows transferred.`);
