import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const host = 'aws-0-us-east-1.pooler.supabase.com';
const port = 6543;
const users = ['postgres.wqlbuadknltsjfzrltpe', 'postgres'];
const passwords = [
  '[$@Khan1234455 ]',
  '[$@Khan1234455]',
  '$@Khan1234455',
  'Khan1234455',
  '%24%40Khan1234455'
];

async function test() {
  for (const user of users) {
    for (const password of passwords) {
      console.log(`Trying user: ${user} with password: ${password}`);
      const client = new Client({
        host,
        port,
        user,
        password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log(`\n🎉 SUCCESS! User: ${user}, Password: ${password}\n`, res.rows[0]);
        await client.end();
        process.exit(0);
      } catch (err) {
        console.log(`  Failed: ${err.message}`);
      }
    }
  }
  console.log('All combinations failed.');
}

test();
