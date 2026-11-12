import test from 'node:test';
import assert from 'node:assert/strict';
import { createTursoDatabase, databaseFromEnv } from '../src/adapters/turso.js';

test('Turso adapter implements D1 prepare/bind/first/all/run contract', async () => {
  const calls = [];
  const client = {
    async execute(stmt) {
      calls.push(stmt);
      return { rows: [{ id: 3, name: 'Test' }], rowsAffected: 1, lastInsertRowid: 3n };
    },
    async batch(stmts, mode) {
      calls.push({ stmts, mode });
      return [{ rows: [], rowsAffected: 1, lastInsertRowid: 4n }];
    }
  };
  const db = createTursoDatabase(client);
  const stmt = db.prepare('SELECT * FROM products WHERE id=?').bind(3);
  assert.equal((await stmt.first()).id, 3);
  assert.equal(await stmt.first('name'), 'Test');
  assert.equal((await stmt.all()).results.length, 1);
  assert.equal((await stmt.run()).meta.last_row_id, 3);
  const results = await db.batch([db.prepare('UPDATE products SET active=0 WHERE id=?').bind(3)]);
  assert.equal(results[0].meta.changes, 1);
  assert.equal(calls.at(-1).mode, 'write');
  assert.deepEqual(calls.at(-1).stmts, [{ sql: 'UPDATE products SET active=0 WHERE id=?', args: [3] }]);
  assert.equal(calls[0].args[0], 3);
});

test('Database resolver fails closed without persistent DB and reuses a native D1 binding', () => {
  assert.throws(() => databaseFromEnv({}), /Database missing/);
  assert.throws(() => databaseFromEnv({ TURSO_DATABASE_URL: 'file:local.db', TURSO_AUTH_TOKEN: 'secret' }), /remote TLS/);
  const db = { prepare() {} };
  assert.equal(databaseFromEnv({ DB: db }), db);
});
