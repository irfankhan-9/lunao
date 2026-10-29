// Persistent JSON-backed SQLite Mock Engine for Dev & AI Studio Environments
// Emulates better-sqlite3 API (prepare, run, get, all, transaction, exec, pragma)
// Saves all table data to server/.data/lunao-db.json so connected OAuth accounts,
// campaigns, and custom templates survive server restarts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '.data');
const DB_FILE = path.join(DATA_DIR, 'lunao-db.json');

const tables = new Map();

function loadFromDisk() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) {
            // Strip any legacy fake seed email accounts that have no real token
            if (k === 'email_accounts') {
              const realOnly = v.filter(
                (r) =>
                  r &&
                  r.encrypted_refresh_token &&
                  r.encrypted_refresh_token !== 'seed_encrypted_token_ready' &&
                  !String(r.encrypted_refresh_token).startsWith('mock_')
              );
              tables.set(k, realOnly);
            } else {
              tables.set(k, v);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[db] Could not load persisted DB file:', err.message);
  }
}

function saveToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj = {};
    for (const [k, v] of tables.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.warn('[db] Could not persist DB file:', err.message);
  }
}

loadFromDisk();

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

          const table = getTable(tableName);
          if (row.id === undefined) {
            row.id = table.length + 1;
          }

          const keyCol = cols.includes('id') ? 'id' : cols.includes('state') ? 'state' : cols.includes('email') ? 'email' : null;
          if (keyCol && row[keyCol] !== undefined && row[keyCol] !== null) {
            const existingIdx = table.findIndex((r) => String(r[keyCol]) === String(row[keyCol]));
            if (existingIdx !== -1) {
              if (isIgnore) {
                return { changes: 0, lastInsertRowid: existingIdx + 1 };
              }
              if (isReplaceOrConflict) {
                table[existingIdx] = { ...table[existingIdx], ...row };
                saveToDisk();
                return { changes: 1, lastInsertRowid: existingIdx + 1 };
              }
            }
          }

          table.push(row);
          saveToDisk();
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
              changes++;
            }
          }
          if (changes > 0) {
            saveToDisk();
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
            table.length = 0;
            saveToDisk();
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
              table.splice(i, 1);
              changes++;
            }
          }
          if (changes > 0) {
            saveToDisk();
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
