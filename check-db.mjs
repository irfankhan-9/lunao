import Database from 'better-sqlite3';
const db = new Database('server/.data/lunao.db', { readonly: true });

const campaigns = db.prepare("SELECT id, niche, status, leads_found, emails_sent, emails_failed, sites_generated FROM email_campaigns ORDER BY created_at DESC LIMIT 5").all();
console.log('=== Email Campaigns ===');
console.log(JSON.stringify(campaigns, null, 2));

if (campaigns.length > 0) {
  const firstId = campaigns[0].id;
  const leads = db.prepare("SELECT * FROM email_leads WHERE campaign_id = ?").all(firstId);
  console.log('\n=== Leads for first campaign ===');
  console.log(JSON.stringify(leads, null, 2));

  const leadsWithAcc = db.prepare(`
    SELECT
      el.*,
      ea.email as account_email,
      ea.provider as account_provider
    FROM email_leads el
    LEFT JOIN email_accounts ea ON el.assigned_account_id = ea.id
    WHERE el.campaign_id = ?
    ORDER BY el.index_in_campaign
  `).all(firstId);
  console.log('\n=== Leads with accounts ===');
  console.log(JSON.stringify(leadsWithAcc, null, 2));
}

db.close();
