// In-Memory SQLite Mock Engine for Dev & AI Studio Environments
// Emulates better-sqlite3 API (prepare, run, get, all, transaction, exec, pragma)

const tables = new Map();

function getTable(name) {
  const cleanName = name.trim().toLowerCase().replace(/[`"']/g, '');
  if (!tables.has(cleanName)) {
    tables.set(cleanName, []);
  }
  return tables.get(cleanName);
}

function parseSql(sql) {
  const s = sql.trim().replace(/\s+/g, ' ');
  return s;
}

export const db = {
  prepare(sql) {
    const rawSql = parseSql(sql);
    const upper = rawSql.toUpperCase();

    // 1. INSERT INTO <table> (...) VALUES (...)
    const insertMatch = rawSql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
      return {
        run(...params) {
          const row = {};
          cols.forEach((col, idx) => {
            row[col] = params[idx] !== undefined ? params[idx] : null;
          });
          const table = getTable(tableName);
          table.push(row);
          return { changes: 1, lastInsertRowid: table.length };
        },
        get() {
          return null;
        },
        all() {
          return [];
        },
      };
    }

    // 2. SELECT ... FROM <table> [WHERE ...]
    const selectMatch = rawSql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY.+?)?(?:\s+LIMIT.+?)?$/i);
    if (selectMatch) {
      const tableName = selectMatch[2];
      const whereClause = selectMatch[3];

      const filterRows = (params) => {
        const table = getTable(tableName);
        if (!whereClause) return [...table];

        // Parse simple equality conditions: `col = ?` or `col1 = ? AND col2 = ?`
        const conds = whereClause.split(/\s+AND\s+/i);
        return table.filter((row) => {
          let pIdx = 0;
          for (const cond of conds) {
            const m = cond.match(/([a-zA-Z0-9_.]+)\s*(=|IS)\s*\?/i);
            if (m) {
              const col = m[1].split('.').pop();
              const expected = params[pIdx++];
              if (row[col] !== expected && String(row[col]) !== String(expected)) {
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
            return { count: rows.length, n: rows.length };
          }
          if (upper.includes('MAX(')) {
            return { m: rows.length };
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

    // 3. DELETE FROM <table> WHERE ...
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
            return { changes: count };
          }
          const conds = whereClause.split(/\s+AND\s+/i);
          let changes = 0;
          for (let i = table.length - 1; i >= 0; i--) {
            const row = table[i];
            let match = true;
            let pIdx = 0;
            for (const cond of conds) {
              const m = cond.match(/([a-zA-Z0-9_.]+)\s*=\s*\?/i);
              if (m) {
                const col = m[1].split('.').pop();
                const expected = params[pIdx++];
                if (row[col] !== expected && String(row[col]) !== String(expected)) {
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

    // 4. Default stub for other SQL (e.g. UPDATE, PRAGMA, CREATE TABLE)
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
