import { createClient } from '@libsql/client/web';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.');
  process.exit(1);
}
if (!/^(libsql|https):\/\//.test(url)) throw new Error('Use a remote TLS Turso URL');
const client = createClient({ url, authToken });
try {
  const filenames = readdirSync(resolve('migrations')).filter(n => /^\d+.*\.sql$/.test(n)).sort();
  // The initial database migration is idempotent (IF NOT EXISTS).
  // Additional schema changes must be managed carefully in future migrations.
  for (const file of filenames) {
    const schema = readFileSync(resolve('migrations', file), 'utf8');
    await client.executeMultiple(schema);
    console.log('Applied migration: ' + file);
  }
  console.log('Turso migrations complete.');
} finally {
  client.close();
}
