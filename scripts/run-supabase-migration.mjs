import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Client } = pg;

const projectRef = 'wqlbuadknltsjfzrltpe';
const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.' + projectRef;
const password = process.env.SUPABASE_DB_PASSWORD || '';

async function runMigration() {
  console.log('Connecting to Supabase PostgreSQL at ' + host + ':' + port + '...');
  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('Connected successfully as user: ' + user);

  const sqlPath = path.resolve('scripts/supabase-migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing scripts/supabase-migration.sql...');
  await client.query(sql);
  console.log('Migration script executed successfully!');

  // Verify created tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('\nVerified tables in public schema:');
  console.log(res.rows.map(r => '  - ' + r.table_name).join('\n'));

  // Notify PostgREST schema cache to reload
  try {
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Notified PostgREST to reload schema cache.');
  } catch (e) {
    console.log('PostgREST notification note:', e.message);
  }

  await client.end();
  console.log('\nAll done! Database is ready.');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
