const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const html = fs.readFileSync('/var/www/lunao/sites/summit-befrnfarber-hub-austin/index.html', 'utf8');

pool.query('UPDATE user_sites SET html = $1 WHERE slug = $2', [html, 'summit-befrnfarber-hub-austin'])
  .then(res => {
    console.log('✓ Successfully updated user_sites in PostgreSQL, row count:', res.rowCount);
    pool.end();
  })
  .catch(err => {
    console.error('Database update error:', err.message);
    pool.end();
  });
