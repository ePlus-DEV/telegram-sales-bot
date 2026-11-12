import { createClient } from '@libsql/client/web';

// D1-compatible query shape, backed by Turso/libSQL for hosts without D1 bindings.
// libSQL batch is atomic (write transaction), matching D1 batch semantics.
export function createTursoDatabase(client) {
  function prepared(sql, args = []) {
    return {
      sql,
      args,
      bind(...values) { return prepared(sql, values); },
      async first(column) {
        const result = await client.execute({ sql, args });
        const row = result.rows[0] ?? null;
        return column && row ? row[column] ?? null : row;
      },
      async all() {
        const result = await client.execute({ sql, args });
        return { results: result.rows, success: true };
      },
      async run() {
        const result = await client.execute({ sql, args });
        return { success: true, meta: { changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0) } };
      }
    };
  }
  return {
    prepare(sql) { return prepared(sql); },
    async batch(statements) {
      const results = await client.batch(statements.map(({ sql, args }) => ({ sql, args })), 'write');
      return results.map(r => ({
        success: true,
        results: r.rows,
        meta: { changes: r.rowsAffected, last_row_id: Number(r.lastInsertRowid ?? 0) }
      }));
    }
  };
}

let cache;
export function databaseFromEnv(env) {
  if (env.DB) return env.DB; // Native Cloudflare D1
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Database missing: configure Cloudflare DB binding or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN');
  if (!/^libsql:\/\/|^https:\/\//.test(url)) throw new Error('TURSO_DATABASE_URL must use a remote TLS endpoint');
  // Reuse the HTTP client across requests within the same warm Node process.
  if (!cache || cache.url !== url || cache.authToken !== authToken) {
    cache = { url, authToken, db: createTursoDatabase(createClient({ url, authToken, intMode: 'number' })) };
  }
  return cache.db;
}
