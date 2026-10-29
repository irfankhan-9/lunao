import pkg from 'pg';
const { Pool } = pkg;

const connectionString = 'postgresql://postgres:%24%40Khan1234455@db.wqlbuadknltsjfzrltpe.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  console.log('Testing Supabase PostgreSQL connection...');
  try {
    const client = await pool.connect();
    console.log('Successfully connected to Supabase PostgreSQL database!');
    const res = await client.query('SELECT NOW() as current_time, current_database();');
    console.log('Query result:', res.rows[0]);

    console.log('Creating database schema tables...');

    await client.query(`
      -- 1. Bookings
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        business_name TEXT,
        customer_name TEXT,
        phone TEXT,
        email TEXT,
        service TEXT,
        date TEXT,
        time TEXT,
        notes TEXT,
        source TEXT DEFAULT 'form',
        status TEXT DEFAULT 'new',
        idempotency_key TEXT,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_slug ON bookings(slug);
      CREATE INDEX IF NOT EXISTS idx_bookings_slug_idempotency ON bookings(slug, idempotency_key);

      -- 2. Chat sessions & messages
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_slug ON chat_sessions(slug);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

      -- 3. Customers & Automations & Leads
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        created_at BIGINT,
        updated_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS automations (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        key TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        updated_at BIGINT,
        UNIQUE(slug, key)
      );

      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        business_name TEXT,
        lead_type TEXT,
        customer_name TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        source TEXT DEFAULT 'form',
        status TEXT DEFAULT 'new',
        idempotency_key TEXT,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );

      -- 4. User Plans & Credits Tracking
      CREATE TABLE IF NOT EXISTS user_plans (
        user_id TEXT PRIMARY KEY,
        email TEXT,
        plan_tier TEXT DEFAULT 'Free Plan',
        monthly_action_credits INT DEFAULT 30,
        monthly_ai_allowance_usd NUMERIC(10,2) DEFAULT 0.00,
        ai_credits_balance INT DEFAULT 0,
        pwa_business_limit INT DEFAULT 1,
        updated_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );

      CREATE TABLE IF NOT EXISTS user_credits (
        user_id TEXT PRIMARY KEY,
        action_credits_balance INT DEFAULT 30,
        ai_credits_balance INT DEFAULT 0,
        ai_dollars_spent NUMERIC(10,4) DEFAULT 0.0000,
        updated_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );

      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        credits_charged INT DEFAULT 0,
        ai_dollars_charged NUMERIC(10,4) DEFAULT 0.0000,
        description TEXT,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );

      -- 5. Affiliates & Referrals Tracking
      CREATE TABLE IF NOT EXISTS affiliates (
        user_id TEXT PRIMARY KEY,
        referral_code TEXT UNIQUE NOT NULL,
        total_referrals INT DEFAULT 0,
        total_earnings_usd NUMERIC(10,2) DEFAULT 0.00,
        payout_email TEXT,
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        affiliate_user_id TEXT NOT NULL REFERENCES affiliates(user_id) ON DELETE CASCADE,
        referred_user_id TEXT NOT NULL,
        referred_user_email TEXT,
        plan_tier TEXT DEFAULT 'Free Plan',
        monthly_revenue_usd NUMERIC(10,2) DEFAULT 0.00,
        commission_rate NUMERIC(4,2) DEFAULT 0.40,
        earned_usd NUMERIC(10,2) DEFAULT 0.00,
        status TEXT DEFAULT 'active',
        created_at BIGINT DEFAULT extract(epoch from now()) * 1000
      );
      CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON referrals(affiliate_user_id);
    `);

    console.log('✅ ALL TABLES CREATED AND INDEXED SUCCESSFULLY IN SUPABASE!');
    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Database setup error:', err);
    await pool.end();
    process.exit(1);
  }
}

main();
