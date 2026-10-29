// scripts/db-backup.mjs
// One-shot backup: dumps the Postgres database referenced by $DATABASE_URL
// to a local .sql file. Use this before risky schema changes, or schedule
// it as a Railway Cron job for weekly off-site backups.
//
//   $env:DATABASE_URL = "postgresql://..."
//   npm run db:backup
//
// The file is written to server/.data/backup-<utc-iso>.sql. Add this path
// to your off-site backup rotation (S3, Backblaze, rsync, etc.).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

const OUT_DIR = path.resolve('server/.data');
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(OUT_DIR, `backup-${stamp}.sql`);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

// Stream a SQL dump using pg_dump-equivalent logic (we re-implement the
// small subset we need; for a full pg_dump use `pg_dump` from the CLI).
const client = await pool.connect();
const tablesRes = await client.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
);
const tables = tablesRes.rows.map((r) => r.tablename);

let dump = `-- Lunao Postgres backup\n-- generated: ${new Date().toISOString()}\n\n`;
for (const table of tables) {
  dump += `\n-- === ${table} ===\n`;
  dump += `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;\n`;
  const rows = await client.query(`SELECT * FROM ${table}`);
  for (const row of rows.rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => {
      const v = row[c];
      if (v === null) return 'NULL';
      if (typeof v === 'number') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    dump += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
  }
}
client.release();
await pool.end();

fs.writeFileSync(OUT, dump);
console.log(`Backup written to ${OUT} (${dump.length} bytes, ${tables.length} tables).`);
