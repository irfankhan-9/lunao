// Production Supabase Synchronization, Startup Data Migration & Direct PostgreSQL Data Layer
// Connects AI Website Studio (site_history, custom_templates, template_categories),
// Email Campaigns (email_accounts, email_campaigns, email_leads, email_send_history, email_suppression),
// SMS Campaigns & Telnyx (campaigns, sms_campaigns, campaign_leads, sms_campaign_leads, telnyx_connections, sms_logs, sms_inbound),
// and Site Editor / PWA (business_profiles, booking_configs, site_addons, invite_codes)
// directly to Supabase PostgreSQL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPgPool, getSupabase } from './supabase.js';

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
  if (!tablesMap) return;
  const pool = customPool || getPgPool();

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
    let rawRows = null;
    if (pool) {
      try {
        const { rows } = await pool.query(`SELECT * FROM public.${tbl}`);
        rawRows = rows;
      } catch {
        // Pool failed (e.g. IPv6 ENETUNREACH)
      }
    }

    if (!rawRows) {
      try {
        const sb = getSupabase();
        if (sb) {
          const { data, error } = await sb.from(tbl).select('*');
          if (!error && Array.isArray(data)) {
            rawRows = data;
          }
        }
      } catch {
        // Supabase client error
      }
    }

    if (!rawRows || !Array.isArray(rawRows)) continue;

    try {
      const normalizedRows = rawRows.map((r) => {
        const copy = { ...r };
        for (const col of BOOLEAN_COLUMNS) {
          if (col in copy && typeof copy[col] === 'boolean') {
            copy[col] = copy[col] ? 1 : 0;
          }
        }
        for (const [k, v] of Object.entries(copy)) {
          if (
            typeof v === 'string' &&
            /^(created_at|updated_at|started_at|completed_at|sent_at|connected_at|last_reset_at|expires_at|received_at|used_at|last_active_at|revoked_at)$/.test(k) &&
            /^\d+$/.test(v)
          ) {
            copy[k] = Number(v);
          }
        }
        return copy;
      });
      tablesMap.set(tbl, normalizedRows);
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// DIRECT SUPABASE QUERIES FOR AI WEBSITE STUDIO (site_history, custom_templates, template_categories)
// ============================================================================

export async function pgListSiteHistory(ownerKey, parentSlug = null) {
  if (!ownerKey) return [];
  const sb = getSupabase();
  const pool = getPgPool();
  let rows = [];

  // 1. Try Supabase REST Client first (immune to IPv6 / port 5432 routing issues)
  if (sb) {
    try {
      let query = sb.from('site_history').select('*');
      if (ownerKey) {
        query = query.eq('owner_key', ownerKey);
      }
      if (parentSlug) {
        query = query.eq('parent_slug', parentSlug);
      }
      query = query.order('updated_at', { ascending: false }).order('created_at', { ascending: false });
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        rows = data;
      } else if (error) {
        console.warn('[Supabase REST] pgListSiteHistory warning:', error.message);
      }
    } catch (err) {
      console.warn('[Supabase REST] pgListSiteHistory exception:', err.message);
    }
  }

  // 2. Fallback to direct Postgres pool if REST returned nothing
  if (rows.length === 0 && pool) {
    try {
      const params = [ownerKey];
      let sql = `SELECT * FROM public.site_history WHERE owner_key = $1`;
      if (parentSlug) {
        params.push(parentSlug);
        sql += ` AND parent_slug = $2`;
      }
      sql += ` ORDER BY updated_at DESC, created_at DESC`;
      const res = await pool.query(sql, params);
      if (res?.rows?.length) {
        rows = res.rows;
      }
    } catch {
      // Safe fallback - pool may be unreachable
    }
  }

  // 3. Also pull from custom_templates to ensure all saved vibe-coded templates appear
  if (sb && !parentSlug) {
    try {
      const { data: tmplData } = await sb
        .from('custom_templates')
        .select('*')
        .eq('owner_key', ownerKey)
        .order('updated_at', { ascending: false });
      if (Array.isArray(tmplData)) {
        for (const t of tmplData) {
          rows.push({
            id: t.id,
            parent_slug: t.slug,
            title: t.name,
            niche: t.niche,
            html: t.raw_html || t.preview_html,
            snapshot_label: `Saved Template (${t.niche || 'General'})`,
            is_template: true,
            template_id: t.id,
            template_name: t.name,
            created_at: Number(t.created_at) || Date.now(),
            updated_at: Number(t.updated_at) || Number(t.created_at) || Date.now(),
          });
        }
      }
    } catch {
      // Safe fallback
    }
  }

  // Deduplicate by template_id, parent_slug, title, or id
  const seen = new Set();
  const unique = [];
  for (const r of rows || []) {
    if (!r) continue;
    const key = String(r.template_id || r.parent_slug || r.title || r.id).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        id: r.id,
        parentSlug: r.parent_slug || r.parentSlug,
        title: r.title || r.name || 'Bespoke Business Website',
        niche: r.niche || 'Local Business',
        html: r.html || r.raw_html || r.preview_html || '',
        snapshotLabel: r.snapshot_label || r.snapshotLabel || 'Saved Build',
        isTemplate: Boolean(r.is_template ?? r.isTemplate ?? r.template_id ?? r.templateId),
        templateId: r.template_id || r.templateId || null,
        templateName: r.template_name || r.templateName || r.title || null,
        createdAt: Number(r.created_at || r.createdAt) || Date.now(),
        updatedAt: Number(r.updated_at || r.updatedAt || r.created_at || r.createdAt) || Date.now(),
      });
    }
  }
  return unique;
}

export async function pgGetSiteHistoryById(id, ownerKey) {
  if (!id) return null;
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      let query = sb.from('site_history').select('*').eq('id', id);
      if (ownerKey) query = query.eq('owner_key', ownerKey);
      const { data, error } = await query.limit(1);
      if (!error && data && data[0]) {
        const r = data[0];
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
          updatedAt: Number(r.updated_at) || Number(r.created_at) || Date.now(),
        };
      }

      // Also check if id is a custom_template
      let tmplQuery = sb.from('custom_templates').select('*').eq('id', id);
      if (ownerKey) tmplQuery = tmplQuery.eq('owner_key', ownerKey);
      const { data: tData } = await tmplQuery.limit(1);
      if (tData && tData[0]) {
        const t = tData[0];
        return {
          id: t.id,
          ownerKey: t.owner_key,
          parentSlug: t.slug,
          title: t.name,
          niche: t.niche,
          html: t.raw_html || t.preview_html,
          snapshotLabel: `Saved Template (${t.niche || 'General'})`,
          isTemplate: true,
          templateId: t.id,
          templateName: t.name,
          createdAt: Number(t.created_at) || Date.now(),
          updatedAt: Number(t.updated_at) || Number(t.created_at) || Date.now(),
        };
      }
    } catch (err) {
      console.warn('[Supabase REST] pgGetSiteHistoryById warning:', err.message);
    }
  }

  if (pool && ownerKey) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM public.site_history WHERE id = $1 AND owner_key = $2 LIMIT 1`,
        [id, ownerKey]
      );
      const r = rows?.[0];
      if (r) {
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
          updatedAt: Number(r.updated_at) || Number(r.created_at) || Date.now(),
        };
      }
    } catch {}
  }

  return null;
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
  const sb = getSupabase();
  const pool = getPgPool();
  const now = Date.now();

  let existing = null;

  // 1. Try Supabase REST Client
  if (sb && ownerKey) {
    try {
      if (incomingId) {
        const { data } = await sb.from('site_history').select('*').eq('id', incomingId).eq('owner_key', ownerKey).limit(1);
        if (data && data[0]) existing = data[0];
      }
      if (!existing && parentSlug) {
        const { data } = await sb.from('site_history').select('*').eq('parent_slug', parentSlug).eq('owner_key', ownerKey).order('updated_at', { ascending: false }).limit(1);
        if (data && data[0]) existing = data[0];
      }
      if (!existing && templateId) {
        const { data } = await sb.from('site_history').select('*').eq('template_id', templateId).eq('owner_key', ownerKey).order('updated_at', { ascending: false }).limit(1);
        if (data && data[0]) existing = data[0];
      }

      if (existing) {
        const updatedTitle = title || existing.title || 'Bespoke Business Website';
        const updatedNiche = niche || existing.niche || 'Local Business';
        const updatedTmplId = templateId || existing.template_id || null;
        const updatedTmplName = templateName || existing.template_name || null;
        const updatedIsTmpl = Boolean(isTemplate || existing.is_template || updatedTmplId);

        const updatePayload = {
          html,
          title: updatedTitle,
          niche: updatedNiche,
          snapshot_label: snapshotLabel,
          template_id: updatedTmplId,
          template_name: updatedTmplName,
          is_template: updatedIsTmpl,
          owner_key: ownerKey,
          updated_at: now,
        };

        const { data, error } = await sb
          .from('site_history')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single();

        if (!error && data) {
          // If this site history entry is connected to a custom template, update the template too!
          if (updatedTmplId) {
            try {
              await sb
                .from('custom_templates')
                .update({
                  raw_html: html,
                  updated_at: now,
                  name: updatedTitle,
                  niche: updatedNiche,
                })
                .eq('id', updatedTmplId)
                .eq('owner_key', ownerKey);
            } catch {}
          }

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
      }

      const id = incomingId || `hist_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const finalSlug = parentSlug || `studio-${id}`;
      const finalTitle = title || 'Bespoke Business Website';
      const finalNiche = niche || 'Local Business';
      const finalIsTmpl = Boolean(isTemplate || templateId);

      const insertPayload = {
        id,
        owner_key: ownerKey,
        parent_slug: finalSlug,
        title: finalTitle,
        niche: finalNiche,
        html,
        snapshot_label: snapshotLabel,
        is_template: finalIsTmpl,
        template_id: templateId || null,
        template_name: templateName || null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await sb
        .from('site_history')
        .upsert(insertPayload, { onConflict: 'id' })
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          parentSlug: data.parent_slug,
          title: data.title,
          niche: data.niche,
          snapshotLabel: data.snapshot_label,
          isTemplate: data.is_template,
          templateId: data.template_id,
          templateName: data.template_name,
          createdAt: Number(data.created_at) || now,
          updatedAt: Number(data.updated_at) || now,
        };
      }
    } catch (err) {
      console.warn('[Supabase REST] pgUpsertSiteHistory warning:', err.message);
    }
  }

  // 2. Pool fallback if REST is not available
  if (pool && ownerKey) {
    try {
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
           SET html = $1, title = $2, niche = $3, snapshot_label = $4, template_id = $5, template_name = $6, is_template = $7, owner_key = $8, updated_at = $9
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
           html = EXCLUDED.html, title = EXCLUDED.title, niche = EXCLUDED.niche, snapshot_label = EXCLUDED.snapshot_label,
           is_template = EXCLUDED.is_template, template_id = COALESCE(EXCLUDED.template_id, public.site_history.template_id),
           template_name = COALESCE(EXCLUDED.template_name, public.site_history.template_name), updated_at = EXCLUDED.updated_at`,
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
    } catch {}
  }

  // 3. Fallback memory/return object so caller never crashes
  const fallbackId = incomingId || `hist_${now}`;
  return {
    id: fallbackId,
    parentSlug: parentSlug || `studio-${fallbackId}`,
    title: title || 'Bespoke Business Website',
    niche: niche || 'Local Business',
    snapshotLabel,
    isTemplate: Boolean(isTemplate || templateId),
    templateId: templateId || null,
    templateName: templateName || null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function pgDeleteSiteHistory(id, ownerKey) {
  if (!id || !ownerKey) return false;
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      const { error, count } = await sb
        .from('site_history')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('owner_key', ownerKey);
      if (!error && (count || 0) > 0) return true;
    } catch {}
  }

  if (pool) {
    try {
      const res = await pool.query(
        `DELETE FROM public.site_history WHERE id = $1 AND owner_key = $2`,
        [id, ownerKey]
      );
      return (res.rowCount || 0) > 0;
    } catch {}
  }

  return false;
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
  const sb = getSupabase();
  const pool = getPgPool();
  const now = Date.now();

  if (sb) {
    try {
      const payload = {
        id,
        owner_key: ownerKey,
        category_id: categoryId,
        name,
        slug,
        niche,
        raw_html: rawHtml || '',
        preview_html: previewHtml || '',
        style_tags: styleTags || '',
        used_count: usedCount,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await sb
        .from('custom_templates')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
      if (!error && data) {
        return { id: data.id, ownerKey: data.owner_key, categoryId: data.category_id, name: data.name, slug: data.slug, niche: data.niche, createdAt: now };
      }
    } catch (err) {
      console.warn('[Supabase REST] pgUpsertCustomTemplate warning:', err.message);
    }
  }

  if (pool) {
    try {
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
    } catch {}
  }

  return { id, ownerKey, categoryId, name, slug, niche, createdAt: now };
}

export async function pgListCustomTemplates(ownerKey = null, categoryId = null) {
  if (!ownerKey) return [];
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      let query = sb.from('custom_templates').select('*');
      if (ownerKey) query = query.eq('owner_key', ownerKey);
      if (categoryId) query = query.eq('category_id', categoryId);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (!error && Array.isArray(data)) return data;
    } catch (err) {
      console.warn('[Supabase REST] pgListCustomTemplates warning:', err.message);
    }
  }

  if (pool) {
    try {
      const params = [ownerKey];
      let sql = `SELECT * FROM public.custom_templates WHERE owner_key = $1`;
      if (categoryId) {
        params.push(categoryId);
        sql += ` AND category_id = $2`;
      }
      sql += ` ORDER BY created_at DESC`;
      const { rows } = await pool.query(sql, params);
      return rows || [];
    } catch {}
  }

  return [];
}

export async function pgGetCustomTemplate(keyOrId) {
  if (!keyOrId) return null;
  const sb = getSupabase();
  const pool = getPgPool();
  const k = String(keyOrId).trim();

  if (sb) {
    try {
      const { data, error } = await sb
        .from('custom_templates')
        .select('*')
        .or(`id.eq.${k},slug.eq.${k},name.ilike.${k}`)
        .limit(1);
      if (!error && data && data[0]) return data[0];
    } catch {}
  }

  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM public.custom_templates WHERE id = $1 OR slug = $1 OR lower(name) = lower($1) LIMIT 1`,
        [k]
      );
      return rows?.[0] || null;
    } catch {}
  }

  return null;
}

export async function pgDeleteCustomTemplate(id, ownerKey) {
  if (!id || !ownerKey) return false;
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      const { error, count } = await sb
        .from('custom_templates')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('owner_key', ownerKey);
      if (!error && (count || 0) > 0) return true;
    } catch {}
  }

  if (pool) {
    try {
      const res = await pool.query(
        `DELETE FROM public.custom_templates WHERE id = $1 AND owner_key = $2`,
        [id, ownerKey]
      );
      return (res.rowCount || 0) > 0;
    } catch {}
  }

  return false;
}

export async function pgListTemplateCategories(ownerKey) {
  if (!ownerKey) return [];
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      const { data: cats, error } = await sb
        .from('template_categories')
        .select('id, name, color, icon, sort_order')
        .eq('owner_key', ownerKey)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (!error && Array.isArray(cats)) {
        const { data: tmpls } = await sb
          .from('custom_templates')
          .select('category_id')
          .eq('owner_key', ownerKey);
        const counts = {};
        for (const t of tmpls || []) {
          if (t.category_id) counts[t.category_id] = (counts[t.category_id] || 0) + 1;
        }
        return cats.map(c => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          sortOrder: c.sort_order,
          templateCount: counts[c.id] || 0,
        }));
      }
    } catch {}
  }

  if (pool) {
    try {
      const { rows: cats } = await pool.query(
        `SELECT id, name, color, icon, sort_order FROM public.template_categories
         WHERE owner_key = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [ownerKey]
      );
      const result = [];
      for (const c of cats || []) {
        const cntRes = await pool.query(
          `SELECT COUNT(*)::int AS count FROM public.custom_templates WHERE category_id = $1 AND owner_key = $2`,
          [c.id, ownerKey]
        );
        result.push({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          sortOrder: c.sort_order,
          templateCount: cntRes.rows?.[0]?.count ?? 0,
        });
      }
      return result;
    } catch {}
  }

  return [];
}

export async function pgCreateTemplateCategory(ownerKey, { name, color = '#2563EB', icon = 'layout' }) {
  const sb = getSupabase();
  const pool = getPgPool();
  const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || id;
  const now = Date.now();

  if (sb) {
    try {
      const { data: maxRow } = await sb
        .from('template_categories')
        .select('sort_order')
        .eq('owner_key', ownerKey)
        .order('sort_order', { ascending: false })
        .limit(1);
      const sortOrder = (maxRow?.[0]?.sort_order ?? -1) + 1;
      await sb.from('template_categories').insert({
        id,
        owner_key: ownerKey,
        name: name.trim(),
        slug,
        color,
        icon,
        sort_order: sortOrder,
        created_at: now,
      });
      return { id, name: name.trim(), color, icon, sortOrder, templateCount: 0 };
    } catch {}
  }

  if (pool) {
    try {
      const maxRes = await pool.query(
        `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM public.template_categories WHERE owner_key = $1`,
        [ownerKey]
      );
      const sortOrder = (maxRes.rows?.[0]?.m ?? -1) + 1;
      await pool.query(
        `INSERT INTO public.template_categories (id, owner_key, name, slug, color, icon, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, ownerKey, name.trim(), slug, color, icon, sortOrder, now]
      );
      return { id, name: name.trim(), color, icon, sortOrder, templateCount: 0 };
    } catch {}
  }

  return { id, name: name.trim(), color, icon, sortOrder: 0, templateCount: 0 };
}

export async function pgUpdateTemplateCategory(id, ownerKey, { name, color, icon, sortOrder }) {
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (color !== undefined) updateData.color = color;
      if (icon !== undefined) updateData.icon = icon;
      if (sortOrder !== undefined) updateData.sort_order = sortOrder;
      const { data, error } = await sb
        .from('template_categories')
        .update(updateData)
        .eq('id', id)
        .eq('owner_key', ownerKey)
        .select()
        .single();
      if (!error && data) {
        return { id: data.id, name: data.name, color: data.color, icon: data.icon, sortOrder: data.sort_order };
      }
    } catch {}
  }

  if (pool) {
    try {
      const existRes = await pool.query(
        `SELECT * FROM public.template_categories WHERE id = $1 AND owner_key = $2`,
        [id, ownerKey]
      );
      const existing = existRes.rows?.[0];
      if (existing) {
        const newName = name !== undefined ? name : existing.name;
        const newColor = color !== undefined ? color : existing.color;
        const newIcon = icon !== undefined ? icon : existing.icon;
        const newSort = sortOrder !== undefined ? sortOrder : existing.sort_order;

        await pool.query(
          `UPDATE public.template_categories SET name = $1, color = $2, icon = $3, sort_order = $4 WHERE id = $5 AND owner_key = $6`,
          [newName, newColor, newIcon, newSort, id, ownerKey]
        );
        return { id, name: newName, color: newColor, icon: newIcon, sortOrder: newSort };
      }
    } catch {}
  }

  return null;
}

export async function pgDeleteTemplateCategory(id, ownerKey) {
  const sb = getSupabase();
  const pool = getPgPool();

  if (sb) {
    try {
      await sb.from('custom_templates').update({ category_id: null }).eq('category_id', id).eq('owner_key', ownerKey);
      const { error } = await sb.from('template_categories').delete().eq('id', id).eq('owner_key', ownerKey);
      if (!error) return true;
    } catch {}
  }

  if (pool) {
    try {
      await pool.query(
        `UPDATE public.custom_templates SET category_id = NULL WHERE category_id = $1 AND owner_key = $2`,
        [id, ownerKey]
      );
      await pool.query(
        `DELETE FROM public.template_categories WHERE id = $1 AND owner_key = $2`,
        [id, ownerKey]
      );
      return true;
    } catch {}
  }

  return false;
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
