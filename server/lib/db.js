// Supabase PostgreSQL-Backed Query Engine for Lunao
// Hydrates state from Supabase PostgreSQL on startup (after auto-migrating any legacy records)
// and executes all INSERT, UPDATE, and DELETE mutations directly against Supabase PostgreSQL.

import { getPgPool, getSupabase } from './supabase.js';
import { initSupabaseSyncAndMigrate, pgUpsertRow, hydrateTablesMapFromSupabase, TABLE_PRIMARY_KEYS } from './supabaseSync.js';

const tables = new Map();

// Kick off startup migration from legacy store + full hydration from Supabase PostgreSQL
const _readyPromise = initSupabaseSyncAndMigrate(tables).catch((err) => {
  console.warn('[db] Supabase startup sync warning:', err.message);
});

export function waitForDbReady() {
  return _readyPromise;
}

export async function refreshTableFromSupabase(tableName) {
  const pool = getPgPool();
  try {
    await hydrateTablesMapFromSupabase(tables, pool || null);
  } catch (err) {
    console.warn(`[db] Refresh notice on ${tableName}:`, err.message);
  }
}

function syncRowToSupabase(tableName, row) {
  if (!row) return;
  pgUpsertRow(tableName.trim().toLowerCase(), row).catch((err) => {
    console.warn(`[db] Supabase upsert warning on ${tableName}:`, err.message);
  });
}

async function deleteViaSupabaseRest(cleanTbl, pkCols, row) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    let q = sb.from(cleanTbl).delete();
    let hasFilter = false;
    for (const col of pkCols) {
      if (row[col] !== undefined && row[col] !== null) {
        q = q.eq(col, row[col]);
        hasFilter = true;
      }
    }
    if (!hasFilter) return;
    await q;
  } catch (err) {
    console.warn(`[db] Supabase REST delete warning on ${cleanTbl}:`, err.message);
  }
}

function deleteRowFromSupabase(tableName, row) {
  if (!row) return;
  const cleanTbl = tableName.trim().toLowerCase();
  const pkCols = TABLE_PRIMARY_KEYS[cleanTbl] || (row.id !== undefined ? ['id'] : []);
  if (pkCols.length === 0) return;

  const conds = [];
  const vals = [];
  for (const col of pkCols) {
    if (row[col] !== undefined && row[col] !== null) {
      vals.push(row[col]);
      conds.push(`${col} = $${vals.length}`);
    }
  }
  if (conds.length === 0) return;

  const pool = getPgPool();
  if (pool) {
    pool.query(`DELETE FROM public.${cleanTbl} WHERE ${conds.join(' AND ')}`, vals).catch((err) => {
      console.warn(`[db] Supabase delete warning on ${cleanTbl}:`, err.message);
      deleteViaSupabaseRest(cleanTbl, pkCols, row).catch(() => {});
    });
    if (cleanTbl === 'campaigns') {
      pool.query(`DELETE FROM public.sms_campaigns WHERE ${conds.join(' AND ')}`, vals).catch(() => {
        deleteViaSupabaseRest('sms_campaigns', pkCols, row).catch(() => {});
      });
    } else if (cleanTbl === 'campaign_leads') {
      pool.query(`DELETE FROM public.sms_campaign_leads WHERE ${conds.join(' AND ')}`, vals).catch(() => {
        deleteViaSupabaseRest('sms_campaign_leads', pkCols, row).catch(() => {});
      });
    }
    return;
  }

  deleteViaSupabaseRest(cleanTbl, pkCols, row).catch(() => {});
  if (cleanTbl === 'campaigns') {
    deleteViaSupabaseRest('sms_campaigns', pkCols, row).catch(() => {});
  } else if (cleanTbl === 'campaign_leads') {
    deleteViaSupabaseRest('sms_campaign_leads', pkCols, row).catch(() => {});
  }
}

function getTable(name) {
  const cleanName = name.trim().toLowerCase().replace(/[`"']/g, '');
  if (!tables.has(cleanName)) {
    tables.set(cleanName, []);
  }
  return tables.get(cleanName);
}

function parseSql(sql) {
  return sql.trim().replace(/\s+/g, ' ');
}

// Split SQL expressions by top-level comma (respecting parentheses and single quotes)
function splitTopLevelCommas(str) {
  const result = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && str[i - 1] !== '\\') {
      inSingle = !inSingle;
      current += ch;
    } else if (!inSingle && ch === '(') {
      depth++;
      current += ch;
    } else if (!inSingle && ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (!inSingle && depth === 0 && ch === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    result.push(current.trim());
  }
  return result;
}

export const db = {
  prepare(sql) {
    const rawSql = parseSql(sql);
    const upper = rawSql.toUpperCase();

    // 1. INSERT [OR IGNORE|REPLACE] INTO <table> (...) VALUES (...) [ON CONFLICT ...]
    const insertMatch = rawSql.match(
      /INSERT\s+(?:OR\s+(?:IGNORE|REPLACE)\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT[\s\S]*)?$/i
    );
    if (insertMatch) {
      const tableName = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
      const valExprs = splitTopLevelCommas(insertMatch[3]);
      const isReplaceOrConflict = /INSERT\s+OR\s+REPLACE/i.test(rawSql) || /ON\s+CONFLICT/i.test(rawSql);
      const isIgnore = /INSERT\s+OR\s+IGNORE/i.test(rawSql);

      return {
        run(...params) {
          const row = {};
          let pIdx = 0;
          cols.forEach((col, idx) => {
            const expr = valExprs[idx] !== undefined ? valExprs[idx].trim() : '?';
            if (expr === '?') {
              row[col] = params[pIdx++] !== undefined ? params[pIdx - 1] : null;
            } else if (/^COALESCE\(\s*\?\s*,\s*'([^']*)'\s*\)$/i.test(expr)) {
              const m = expr.match(/^COALESCE\(\s*\?\s*,\s*'([^']*)'\s*\)$/i);
              const val = params[pIdx++];
              row[col] = val !== undefined && val !== null ? val : m[1];
            } else if (expr.startsWith("'") && expr.endsWith("'")) {
              row[col] = expr.slice(1, -1);
            } else if (/^NULL$/i.test(expr)) {
              row[col] = null;
            } else if (!isNaN(Number(expr))) {
              row[col] = Number(expr);
            } else {
              row[col] = params[pIdx] !== undefined ? params[pIdx++] : expr;
            }
          });

          const cleanTbl = tableName.trim().toLowerCase().replace(/[`"']/g, '');
          const schemaPks = TABLE_PRIMARY_KEYS[cleanTbl];
          const table = getTable(tableName);
          if (row.id === undefined && (!schemaPks || schemaPks.includes('id'))) {
            let maxId = 0;
            for (const r of table) {
              const n = Number(r.id);
              if (Number.isFinite(n) && n > maxId) maxId = n;
            }
            row.id = maxId + 1;
          }

          const pkCols =
            schemaPks && schemaPks.every((pk) => cols.includes(pk))
              ? schemaPks
              : cols.includes('id')
                ? ['id']
                : cols.includes('slug')
                  ? ['slug']
                  : cols.includes('state')
                    ? ['state']
                    : cols.includes('code')
                      ? ['code']
                      : cols.includes('email')
                        ? ['email']
                        : [];

          if (pkCols.length > 0 && pkCols.every((pk) => row[pk] !== undefined && row[pk] !== null)) {
            const existingIdx = table.findIndex((r) =>
              pkCols.every((pk) => String(r[pk]) === String(row[pk]))
            );
            if (existingIdx !== -1) {
              if (isIgnore) {
                return { changes: 0, lastInsertRowid: existingIdx + 1 };
              }
              if (isReplaceOrConflict) {
                table[existingIdx] = { ...table[existingIdx], ...row };
                syncRowToSupabase(tableName, table[existingIdx]);
                return { changes: 1, lastInsertRowid: existingIdx + 1 };
              }
            }
          }

          table.push(row);
          syncRowToSupabase(tableName, row);
          return { changes: 1, lastInsertRowid: row.id || table.length };
        },
        get() {
          return null;
        },
        all() {
          return [];
        },
      };
    }

    // 2. UPDATE <table> SET <sets> WHERE <where>
    const updateMatch = rawSql.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?$/i);
    if (updateMatch) {
      const tableName = updateMatch[1];
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];

      return {
        run(...params) {
          const table = getTable(tableName);
          const setAssignments = splitTopLevelCommas(setClause);
          let paramIdx = 0;

          const setters = [];
          for (const assign of setAssignments) {
            const m = assign.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/i);
            if (m) {
              const col = m[1];
              const valExpr = m[2].trim();
              if (valExpr === '?') {
                const assignedVal = params[paramIdx++];
                setters.push((row) => {
                  row[col] = assignedVal;
                });
              } else if (/^COALESCE\(\s*\?\s*,\s*0\s*\)$/i.test(valExpr)) {
                const assignedVal = params[paramIdx++];
                setters.push((row) => {
                  row[col] = assignedVal !== undefined && assignedVal !== null ? assignedVal : 0;
                });
              } else if (/^([a-zA-Z0-9_]+)\s*\+\s*1$/i.test(valExpr)) {
                const addCol = valExpr.match(/^([a-zA-Z0-9_]+)\s*\+\s*1$/i)[1];
                setters.push((row) => {
                  row[col] = (Number(row[addCol]) || 0) + 1;
                });
              } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
                const literalVal = valExpr.slice(1, -1);
                setters.push((row) => {
                  row[col] = literalVal;
                });
              } else if (/^NULL$/i.test(valExpr)) {
                setters.push((row) => {
                  row[col] = null;
                });
              } else if (!isNaN(Number(valExpr))) {
                const numVal = Number(valExpr);
                setters.push((row) => {
                  row[col] = numVal;
                });
              } else {
                // Count any ? inside complex expressions (e.g. COALESCE(NULLIF(?, ""), title))
                const qCount = (valExpr.match(/\?/g) || []).length;
                if (qCount > 0) {
                  const firstVal = params[paramIdx];
                  paramIdx += qCount;
                  setters.push((row) => {
                    if (firstVal !== undefined && firstVal !== null && firstVal !== '') {
                      row[col] = firstVal;
                    }
                  });
                }
              }
            }
          }

          let changes = 0;
          for (const row of table) {
            let match = true;
            if (whereClause) {
              const conds = whereClause.split(/\s+AND\s+/i);
              let wIdx = paramIdx;
              for (const cond of conds) {
                const fnMatch = cond.match(/(LOWER|UPPER)\s*\(\s*([a-zA-Z0-9_.]+)\s*\)\s*=\s*\?/i);
                if (fnMatch) {
                  const fn = fnMatch[1].toUpperCase();
                  const col = fnMatch[2].split('.').pop();
                  const expected = params[wIdx++];
                  const actualStr = row[col] == null ? '' : String(row[col]);
                  const expStr = expected == null ? '' : String(expected);
                  const isEq = fn === 'LOWER'
                    ? actualStr.toLowerCase() === expStr.toLowerCase()
                    : actualStr.toUpperCase() === expStr.toUpperCase();
                  if (!isEq) {
                    match = false;
                    break;
                  }
                  continue;
                }
                const m = cond.match(/([a-zA-Z0-9_.]+)\s*=\s*\?/i);
                if (m) {
                  const col = m[1].split('.').pop();
                  const expected = params[wIdx++];
                  if (row[col] !== expected && String(row[col]) !== String(expected)) {
                    match = false;
                    break;
                  }
                }
              }
            }
            if (match) {
              setters.forEach((setFn) => setFn(row));
              syncRowToSupabase(tableName, row);
              changes++;
            }
          }
          return { changes };
        },
        get() {
          return null;
        },
        all() {
          return [];
        },
      };
    }

    // 3. SELECT ... FROM <table> [WHERE ...]
    const selectMatch = rawSql.match(
      /SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z0-9_]+)?(?:\s+LEFT\s+JOIN\s+[a-zA-Z0-9_]+\s+[a-zA-Z0-9_]+\s+ON\s+[^\s]+\s*=\s*[^\s]+)?(?:\s+JOIN\s+[a-zA-Z0-9_]+\s+[a-zA-Z0-9_]+\s+ON\s+[^\s]+\s*=\s*[^\s]+)?(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY.+?)?(?:\s+ORDER\s+BY.+?)?(?:\s+LIMIT.+?)?$/i
    );
    if (selectMatch) {
      const tableName = selectMatch[2];
      const whereClause = selectMatch[3];

      const filterRows = (params) => {
        const table = getTable(tableName);
        if (!whereClause) return [...table];

        const conds = whereClause.split(/\s+AND\s+/i);
        return table.filter((row) => {
          let pIdx = 0;
          for (const cond of conds) {
            const nullMatch = cond.match(/([a-zA-Z0-9_.]+)\s+IS\s+(NOT\s+)?NULL/i);
            if (nullMatch && !cond.includes('?')) {
              const col = nullMatch[1].split('.').pop();
              const isNot = Boolean(nullMatch[2]);
              const val = row[col];
              const isNullish = val === null || val === undefined;
              if (isNot && isNullish) return false;
              if (!isNot && !isNullish) return false;
              continue;
            }
            const fnMatch = cond.match(/(LOWER|UPPER)\s*\(\s*([a-zA-Z0-9_.]+)\s*\)\s*(=|IS|!=)\s*\?/i);
            if (fnMatch) {
              const fn = fnMatch[1].toUpperCase();
              const col = fnMatch[2].split('.').pop();
              const op = fnMatch[3].toUpperCase();
              const expected = params[pIdx++];
              const actualStr = row[col] == null ? '' : String(row[col]);
              const expStr = expected == null ? '' : String(expected);
              const isEq = fn === 'LOWER'
                ? actualStr.toLowerCase() === expStr.toLowerCase()
                : actualStr.toUpperCase() === expStr.toUpperCase();
              if (op === '!=' && isEq) return false;
              if ((op === '=' || op === 'IS') && !isEq) return false;
              continue;
            }
            const m = cond.match(/([a-zA-Z0-9_.]+)\s*(=|IS|>|<|!=)\s*\?/i);
            if (m) {
              const col = m[1].split('.').pop();
              const op = m[2].toUpperCase();
              const expected = params[pIdx++];
              if (op === '>' && !(Number(row[col]) > Number(expected))) return false;
              if (op === '<' && !(Number(row[col]) < Number(expected))) return false;
              if (op === '!=' && String(row[col]) === String(expected)) return false;
              if ((op === '=' || op === 'IS') && row[col] !== expected && String(row[col]) !== String(expected)) {
                return false;
              }
            }
          }
          return true;
        });
      };

      return {
        get(...params) {
          const rows = filterRows(params);
          if (upper.includes('COUNT(*)')) {
            return {
              count: rows.length,
              n: rows.length,
              leads_found: rows.length,
              emails_found: rows.filter((r) => r.email).length,
              sites_generated: rows.filter((r) => r.generated_site_url).length,
              emails_sent: rows.filter((r) => r.send_status === 'sent').length,
              emails_failed: rows.filter((r) => r.send_status === 'failed').length,
            };
          }
          if (upper.includes('MAX(')) {
            return { m: rows.length, next: rows.length };
          }
          if (upper.includes('COALESCE(SUM(')) {
            return { n: rows.length };
          }
          return rows.length > 0 ? { ...rows[0] } : null;
        },
        all(...params) {
          const rows = filterRows(params);
          return rows.map((r) => ({ ...r }));
        },
        run() {
          return { changes: 0 };
        },
      };
    }

    // 4. DELETE FROM <table> WHERE ...
    const deleteMatch = rawSql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1];
      const whereClause = deleteMatch[2];
      return {
        run(...params) {
          const table = getTable(tableName);
          if (!whereClause) {
            const count = table.length;
            for (const row of table) {
              deleteRowFromSupabase(tableName, row);
            }
            table.length = 0;
            return { changes: count };
          }
          const conds = whereClause.split(/\s+AND\s+/i);
          let changes = 0;
          for (let i = table.length - 1; i >= 0; i--) {
            const row = table[i];
            let match = true;
            let pIdx = 0;
            for (const cond of conds) {
              const m = cond.match(/([a-zA-Z0-9_.]+)\s*(=|<|>)\s*\?/i);
              if (m) {
                const col = m[1].split('.').pop();
                const op = m[2];
                const expected = params[pIdx++];
                if (op === '<' && !(Number(row[col]) < Number(expected))) {
                  match = false;
                  break;
                }
                if (op === '>' && !(Number(row[col]) > Number(expected))) {
                  match = false;
                  break;
                }
                if (op === '=' && row[col] !== expected && String(row[col]) !== String(expected)) {
                  match = false;
                  break;
                }
              }
            }
            if (match) {
              deleteRowFromSupabase(tableName, row);
              table.splice(i, 1);
              changes++;
            }
          }
          return { changes };
        },
        get() {
          return null;
        },
        all() {
          return [];
        },
      };
    }

    // 5. Default stub for other SQL (e.g. PRAGMA, CREATE TABLE)
    return {
      get() {
        return null;
      },
      all() {
        return [];
      },
      run() {
        return { changes: 1 };
      },
    };
  },
  transaction(fn) {
    return (...args) => fn(...args);
  },
  exec() {
    return {};
  },
  pragma() {},
};

export default db;
