import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/runtime.js';
import { createServer } from '../src/server.js';

test('Web-standard handler maps Vercel route to the original worker path', async () => {
  const db = { prepare() { throw new Error('health should not query'); } };
  const response = await handleRequest(new Request('https://unit.test/api/healthz'), {
    path: '/healthz', env: { DB: db }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('Node HTTP adapter can serve health without any Cloudflare runtime', async t => {
  const server = createServer({ DB: { prepare() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch('http://127.0.0.1:' + port + '/healthz');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
