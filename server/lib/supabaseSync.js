// Production Supabase Synchronization, Startup Data Migration & Direct PostgreSQL Data Layer
// Connects AI Website Studio (site_history, custom_templates, template_categories),
// Email Campaigns (email_accounts, email_campaigns, email_leads, email_send_history, email_suppression),
// SMS Campaigns & Telnyx (campaigns, sms_campaigns, campaign_leads, sms_campaign_leads, telnyx_connections, sms_logs, sms_inbound),
// and Site Editor / PWA (business_profiles, booking_configs, site_addons, invite_codes)
// directly to Supabase PostgreSQL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPgPool } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_DB_FILE = path.resolve(__dirname, '..', '.data', 'lunao-db.json');
const MIGRATION_SQL_FILE = path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20261101_complete_supabase_sync_and_rls.sql');

// Primary keys for each table to support automatic ON CONFLICT upserts
export const TABLE_PRIMARY_KEYS = {
  site_history: ['id'],
  custom_templates: ['id'],
  template_categories: ['id'],
  email_accounts: ['id'],
  email_campaigns: ['id'],
  email_leads: ['id'],
  email_send_history: ['id'],
  email_logs: ['id'],
  email_suppression: ['owner_key', 'email'],
  email_suppressions: ['owner_key', 'email'],
  campaigns: ['id'],
  sms_campaigns: ['id'],
  campaign_leads: ['id'],
  sms_campaign_leads: ['id'],
  telnyx_connections: ['id'],
  sms_logs: ['id'],
  sms_inbound: ['id'],
  business_profiles: ['slug'],
  oauth_states: ['state'],
  places_lead_cache: ['searched_city_norm', 'niche_norm', 'place_id'],
  invite_codes: ['code'],
  site_addons: ['slug'],
  booking_configs: ['slug'],
  credit_accounts: ['owner_key'],
  special_mode_sessions: ['owner_key'],
  owner_businesses: ['owner_key', 'slug'],
  user_sites: ['slug'],
};

const BOOLEAN_COLUMNS = new Set([
  'is_template',
  'paused',
  'refunded',
  'is_pwa_connected',
  'feature_booking',
  'feature_chatbot',
  'feature_email',
  'feature_automations',
  'booking_enabled',
  'chatbot_enabled',
  'enabled',
  'is_active',
]);

export function sanitizeRowForPostgres(tableName, rawRow) {
  if (!rawRow || typeof rawRow !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(rawRow)) {
    // Skip synthetic auto-increment id on tables where id is not primary key or where composite key is used
    if (
      k === 'id' &&
      ['business_profiles', 'places_lead_cache', 'owner_businesses', 'invite_codes', 'site_addons', 'booking_configs', 'credit_accounts', 'special_mode_sessions'].includes(tableName)
    ) {
      continue;
    }
    if (BOOLEAN_COLUMNS.has(k)) {
      clean[k] = Boolean(v && v !== 0 && v !== '0' && v !== 'false');
    } else if (v === undefined) {
      clean[k] = null;
    } else {
      clean[k] = v;
    }
  }

  // Ensure required defaults for specific tables
  if ((tableName === 'campaigns' || tableName === 'sms_campaigns') && !clean.owner_key) {
    clean.owner_key = 'default_owner';
  }
  if ((tableName === 'campaign_leads' || tableName === 'sms_campaign_leads') && !clean.id) {
    clean.id = `lead_${clean.campaign_id || 'c'}_${clean.index_in_campaign ?? Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
  if (tableName === 'email_leads' && !clean.id) {
    clean.id = `elead_${clean.campaign_id || 'ec'}_${clean.index_in_campaign ?? Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
  if (tableName === 'business_profiles' && !clean.owner_key) {
    clean.owner_key = 'default_owner';
  }
  if (tableName === 'email_accounts' && !clean.owner_key) {
    clean.owner_key = clean.user_id || 'default_owner';
  }
  if (tableName === 'email_campaigns' && !clean.owner_key) {
    clean.owner_key = clean.user_id || 'default_owner';
  }

  return clean;
}

/**
 * Upserts a single record into a Supabase PostgreSQL table.
 */
export async function pgUpsertRow(tableName, rawRow, customPool = null) {
  const pool = customPool || getPgPool();
  if (!pool) return null;

  const row = sanitizeRowForPostgres(tableName, rawRow);
  const cols = Object.keys(row);
  if (cols.length === 0) return null;

  const vals = cols.map((c) => row[c]);
  const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
  const pkCols = TABLE_PRIMARY_KEYS[tableName] || (cols.includes('id') ? ['id'] : []);

  let sql = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES (${placeholders})`;
  if (pkCols.length > 0 && pkCols.every((pk) => cols.includes(pk))) {
    const updateCols = cols.filter((c) => !pkCols.includes(c));
    if (updateCols.length > 0) {
      const updates = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      sql += ` ON CONFLICT (${pkCols.join(', ')}) DO UPDATE SET ${updates}`;
    } else {
      sql += ` ON CONFLICT (${pkCols.join(', ')}) DO NOTHING`;
    }
  }

  try {
    await pool.query(sql, vals);
    // Keep canonical paired tables in sync (campaigns <-> sms_campaigns, campaign_leads <-> sms_campaign_leads, email_suppression <-> email_suppressions)
    if (tableName === 'campaigns') {
      await pgUpsertRow('sms_campaigns', rawRow, pool);
    } else if (tableName === 'campaign_leads') {
      await pgUpsertRow('sms_campaign_leads', rawRow, pool);
    }
  } catch (err) {
    // Ignore benign duplicate or constraint notices during background sync
    if (!String(err.message).includes('duplicate key')) {
      console.warn(`[supabaseSync] Upsert notice on ${tableName}:`, err.message);
    }
  }
}

let _initialized = false;

/**
 * 1. Ensures all tables and RLS policies exist in Supabase.
 * 2. Auto-migrates any existing local records from server/.data/lunao-db.json into Supabase.
 * 3. Returns all hydrated table rows from Supabase PostgreSQL.
 */
export async function initSupabaseSyncAndMigrate(inMemoryTablesMap = null) {
  const pool = getPgPool();
  if (!pool) {
    console.warn('[supabaseSync] No PostgreSQL pool available.');
    return { ok: false };
  }

  try {
    // 1. Ensure schema & RLS policies are applied
    if (!_initialized && fs.existsSync(MIGRATION_SQL_FILE)) {
      const ddl = fs.readFileSync(MIGRATION_SQL_FILE, 'utf8');
      await pool.query(ddl);
      _initialized = true;
    }

    // 2. Auto-migrate existing local data from server/.data/lunao-db.json into Supabase on startup
    if (fs.existsSync(LEGACY_DB_FILE)) {
      try {
        const raw = fs.readFileSync(LEGACY_DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const migratableTables = [
            'site_history',
            'custom_templates',
            'template_categories',
            'telnyx_connections',
            'business_profiles',
            'email_accounts',
            'email_campaigns',
            'email_leads',
            'campaigns',
            'campaign_leads',
            'sms_logs',
            'sms_inbound',
            'places_lead_cache',
            'invite_codes',
            'owner_businesses',
            'credit_accounts',
          ];

          for (const tbl of migratableTables) {
            const rows = parsed[tbl];
            if (Array.isArray(rows) && rows.length > 0) {
              for (const r of rows) {
                if (tbl === 'email_accounts') {
                  if (!r?.encrypted_refresh_token || r.encrypted_refresh_token === 'seed_encrypted_token_ready' || String(r.encrypted_refresh_token).startsWith('mock_')) {
                    continue;
                  }
                }
                await pgUpsertRow(tbl, r, pool);
              }
            }
          }
        }
      } catch (migErr) {
        console.warn('[supabaseSync] Local data auto-migration notice:', migErr.message);
      }
    }

    // 3. Hydrate in-memory query map directly from authoritative Supabase PostgreSQL tables
    if (inMemoryTablesMap && typeof inMemoryTablesMap.set === 'function') {
      await hydrateTablesMapFromSupabase(inMemoryTablesMap, pool);
    }

    return { ok: true };
  } catch (err) {
    console.warn('[supabaseSync] Initialization notice:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function hydrateTablesMapFromSupabase(tablesMap, customPool = null) {
  const pool = customPool || getPgPool();
  if (!pool || !tablesMap) return;

  const tablesToLoad = [
    'site_history',
    'custom_templates',
    'template_categories',
    'email_accounts',
    'email_campaigns',
    'email_leads',
    'email_send_history',
    'email_logs',
    'email_suppression',
    'campaigns',
    'campaign_leads',
    'telnyx_connections',
    'sms_logs',
    'sms_inbound',
    'business_profiles',
    'oauth_states',
    'places_lead_cache',
    'invite_codes',
    'site_addons',
    'booking_configs',
    'credit_accounts',
    'credit_ledger',
    'special_mode_sessions',
    'owner_businesses',
    'user_sites',
  ];

  for (const tbl of tablesToLoad) {
    try {
      const { rows } = await pool.query(`SELECT * FROM public.${tbl}`);
      const normalizedRows = (rows || []).map((r) => {
        const copy = { ...r };
        for (const col of BOOLEAN_COLUMNS) {
          if (col in copy && typeof copy[col] === 'boolean') {
            // Convert numeric/boolean columns seamlessly for legacy readers that check === 1 or boolean
            copy[col] = copy[col] ? 1 : 0;
          }
        }
        for (const [k, v] of Object.entries(copy)) {
          if (typeof v === 'string' && /^(created_at|updated_at|started_at|completed_at|sent_at|connected_at|last_reset_at|expires_at|received_at|used_at|last_active_at|revoked_at)$/.test(k) && /^\d+$/.test(v)) {
            copy[k] = Number(v);
          }
        }
        return copy;
      });
      tablesMap.set(tbl, normalizedRows);
    } catch {
      // ignore if table not yet populated
    }
  }
}

// ============================================================================
// DIRECT SUPABASE QUERIES FOR AI WEBSITE STUDIO (site_history, custom_templates, template_categories)
// ============================================================================

export async function pgListSiteHistory(ownerKey, parentSlug = null) {
  const pool = getPgPool();
  if (!pool || !ownerKey) return [];
  const params = [ownerKey];
  let sql = `SELECT * FROM public.site_history WHERE owner_key = $1`;
  if (parentSlug) {
    params.push(parentSlug);
    sql += ` AND parent_slug = $2`;
  }
  sql += ` ORDER BY updated_at DESC, created_at DESC`;
  const { rows } = await pool.query(sql, params);

  const seen = new Set();
  const unique = [];
  for (const r of rows || []) {
    const key = String(r.template_id || r.parent_slug || r.title || r.id).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        id: r.id,
        parentSlug: r.parent_slug,
        title: r.title,
        niche: r.niche,
        html: r.html,
        snapshotLabel: r.snapshot_label,
        isTemplate: Boolean(r.is_template),
        templateId: r.template_id,
        templateName: r.template_name,
        createdAt: Number(r.created_at) || Date.now(),
        updatedAt: Number(r.updated_at) || Number(r.created_at) || Date.now(),
      });
    }
  }
  return unique;
}

export async function pgGetSiteHistoryById(id, ownerKey) {
  const pool = getPgPool();
  if (!pool || !ownerKey) return null;
  const { rows } = await pool.query(
    `SELECT * FROM public.site_history WHERE id = $1 AND owner_key = $2 LIMIT 1`,
    [id, ownerKey]
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: r.id,
    ownerKey: r.owner_key,
    parentSlug: r.parent_slug,
    title: r.title,
    niche: r.niche,
    html: r.html,
    snapshotLabel: r.snapshot_label,
    isTemplate: Boolean(r.is_template),
    templateId: r.template_id,
    templateName: r.template_name,
    createdAt: Number(r.created_at) || Date.now(),
  };
}

export async function pgUpsertSiteHistory({
  id: incomingId,
  ownerKey,
  parentSlug,
  title = '',
  niche = '',
  html,
  snapshotLabel = '',
  templateId = null,
  templateName = null,
  isTemplate = false,
}) {
  const pool = getPgPool();
  const now = Date.now();
  let existing = null;

  if (pool && ownerKey) {
    if (incomingId) {
      const { rows } = await pool.query(
        `SELECT * FROM public.site_history WHERE id = $1 AND owner_key = $2 LIMIT 1`,
        [incomingId, ownerKey]
      );
      existing = rows?.[0] || null;
    }
    if (!existing && parentSlug) {
      const { rows } = await pool.query(
        `SELECT * FROM public.site_history WHERE parent_slug = $1 AND owner_key = $2 ORDER BY updated_at DESC LIMIT 1`,
        [parentSlug, ownerKey]
      );
      existing = rows?.[0] || null;
    }
    if (!existing && templateId) {
      const { rows } = await pool.query(
        `SELECT * FROM public.site_history WHERE template_id = $1 AND owner_key = $2 ORDER BY updated_at DESC LIMIT 1`,
        [templateId, ownerKey]
      );
      existing = rows?.[0] || null;
    }

    if (existing) {
      const updatedTitle = title || existing.title || 'Bespoke Business Website';
      const updatedNiche = niche || existing.niche || 'Local Business';
      const updatedTmplId = templateId || existing.template_id || null;
      const updatedTmplName = templateName || existing.template_name || null;
      const updatedIsTmpl = Boolean(isTemplate || existing.is_template || updatedTmplId);

      await pool.query(
        `UPDATE public.site_history
         SET html = $1,
             title = $2,
             niche = $3,
             snapshot_label = $4,
             template_id = $5,
             template_name = $6,
             is_template = $7,
             owner_key = $8,
             updated_at = $9
         WHERE id = $10`,
        [html, updatedTitle, updatedNiche, snapshotLabel, updatedTmplId, updatedTmplName, updatedIsTmpl, ownerKey, now, existing.id]
      );

      return {
        id: existing.id,
        parentSlug: existing.parent_slug,
        title: updatedTitle,
        niche: updatedNiche,
        snapshotLabel,
        isTemplate: updatedIsTmpl,
        templateId: updatedTmplId,
        templateName: updatedTmplName,
        createdAt: Number(existing.created_at) || now,
        updatedAt: now,
      };
    }

    const id = incomingId || `hist_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const finalSlug = parentSlug || `studio-${id}`;
    const finalTitle = title || 'Bespoke Business Website';
    const finalNiche = niche || 'Local Business';
    const finalIsTmpl = Boolean(isTemplate || templateId);

    await pool.query(
      `INSERT INTO public.site_history
         (id, owner_key, parent_slug, title, niche, html, snapshot_label, is_template, template_id, template_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         html = EXCLUDED.html,
         title = EXCLUDED.title,
         niche = EXCLUDED.niche,
         snapshot_label = EXCLUDED.snapshot_label,
         is_template = EXCLUDED.is_template,
         template_id = COALESCE(EXCLUDED.template_id, public.site_history.template_id),
         template_name = COALESCE(EXCLUDED.template_name, public.site_history.template_name),
         updated_at = EXCLUDED.updated_at`,
      [id, ownerKey, finalSlug, finalTitle, finalNiche, html, snapshotLabel, finalIsTmpl, templateId || null, templateName || null, now, now]
    );

    return {
      id,
      parentSlug: finalSlug,
      title: finalTitle,
      niche: finalNiche,
      snapshotLabel,
      isTemplate: finalIsTmpl,
      templateId: templateId || null,
      templateName: templateName || null,
      createdAt: now,
      updatedAt: now,
    };
  }
  return null;
}

export async function pgDeleteSiteHistory(id, ownerKey) {
  const pool = getPgPool();
  if (!pool || !ownerKey) return false;
  const res = await pool.query(
    `DELETE FROM public.site_history WHERE id = $1 AND owner_key = $2`,
    [id, ownerKey]
  );
  return (res.rowCount || 0) > 0;
}

export async function pgUpsertCustomTemplate({
  id,
  ownerKey = 'dashboard',
  categoryId = null,
  name,
  slug,
  niche = 'General',
  rawHtml,
  previewHtml,
  styleTags = '',
  usedCount = 0,
}) {
  const pool = getPgPool();
  if (!pool) return null;
  const now = Date.now();
  await pool.query(
    `INSERT INTO public.custom_templates
       (id, owner_key, category_id, name, slug, niche, raw_html, preview_html, style_tags, used_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       slug = EXCLUDED.slug,
       niche = EXCLUDED.niche,
       category_id = COALESCE(EXCLUDED.category_id, public.custom_templates.category_id),
       raw_html = COALESCE(NULLIF(EXCLUDED.raw_html, ''), public.custom_templates.raw_html),
       preview_html = COALESCE(NULLIF(EXCLUDED.preview_html, ''), public.custom_templates.preview_html),
       style_tags = COALESCE(NULLIF(EXCLUDED.style_tags, ''), public.custom_templates.style_tags),
       updated_at = EXCLUDED.updated_at`,
    [id, ownerKey, categoryId, name, slug, niche, rawHtml || '', previewHtml || '', styleTags || '', usedCount, now, now]
  );
  return { id, ownerKey, categoryId, name, slug, niche, createdAt: now };
}

export async function pgListCustomTemplates(ownerKey = null, categoryId = null) {
  const pool = getPgPool();
  if (!pool || !ownerKey) return [];
  const params = [ownerKey];
  let sql = `SELECT * FROM public.custom_templates`;
  const where = [`owner_key = $1`];
  if (categoryId) {
    params.push(categoryId);
    where.push(`category_id = $${params.length}`);
  }
  sql += ` WHERE ` + where.join(' AND ');
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows || [];
}

export async function pgGetCustomTemplate(keyOrId) {
  const pool = getPgPool();
  if (!pool || !keyOrId) return null;
  const k = String(keyOrId).trim();
  const { rows } = await pool.query(
    `SELECT * FROM public.custom_templates WHERE id = $1 OR slug = $1 OR lower(name) = lower($1) LIMIT 1`,
    [k]
  );
  return rows?.[0] || null;
}

export async function pgDeleteCustomTemplate(id, ownerKey) {
  const pool = getPgPool();
  if (!pool || !ownerKey) return false;
  const res = await pool.query(
    `DELETE FROM public.custom_templates WHERE id = $1 AND owner_key = $2`,
    [id, ownerKey]
  );
  return (res.rowCount || 0) > 0;
}

export async function getSupabaseFullSyncStatus() {
  const pool = getPgPool();
  if (!pool) return { ok: false, error: 'No Postgres pool configured' };

  const keyTables = [
    'site_history',
    'custom_templates',
    'template_categories',
    'user_credits',
    'user_plans',
    'ai_usage_ledger',
    'ai_model_pricing',
    'email_accounts',
    'email_campaigns',
    'email_leads',
    'email_send_history',
    'email_suppression',
    'campaigns',
    'sms_campaigns',
    'campaign_leads',
    'sms_campaign_leads',
    'telnyx_connections',
    'sms_logs',
    'sms_inbound',
    'user_sites',
    'business_profiles',
    'bookings',
    'leads',
    'customers',
    'automations',
    'chat_sessions',
    'chat_messages',
    'email_automation_jobs',
  ];

  const counts = {};
  for (const t of keyTables) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM public.${t}`);
      counts[t] = rows?.[0]?.cnt ?? 0;
    } catch {
      counts[t] = -1;
    }
  }

  const rlsRes = await pool.query(
    `SELECT count(*)::int AS total_tables,
            count(*) FILTER (WHERE rowsecurity = true)::int AS rls_enabled_tables
     FROM pg_tables WHERE schemaname = 'public'`
  );

  return {
    ok: true,
    rlsSummary: rlsRes.rows?.[0] || {},
    tableRowCounts: counts,
  };
}
