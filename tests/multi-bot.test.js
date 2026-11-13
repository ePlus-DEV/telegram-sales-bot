import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleRequest } from '../src/runtime.js';
import { botRegistry, botEnvironment, selectBotEnvironment, allBotEnvironments } from '../src/multi-bot.js';

function db() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push(sql);
      return {
        bind() { return this; },
        async first() { return null; },
        async all() { return {results:[]}; },
        async run() { return {meta:{changes:1}}; }
      };
    }
  };
}
function config() {
  return {
    MULTI_BOTS: JSON.stringify([
      {id:'shop_a',host:'shop-a.example.com'},
      {id:'shop_b',host:'shop-b.example.com'}
    ]),
    SHOP_A_DB:db(), SHOP_B_DB:db(),
    SHOP_A_BOT_TOKEN:'one-token', SHOP_B_BOT_TOKEN:'two-token',
    SHOP_A_TELEGRAM_WEBHOOK_SECRET:'one-secret',
    SHOP_B_TELEGRAM_WEBHOOK_SECRET:'two-secret',
    SHOP_A_SEPAY_WEBHOOK_API_KEY:'bank-a',
    SHOP_B_SEPAY_WEBHOOK_API_KEY:'bank-b',
    SHOP_A_ADMIN_DASHBOARD_PASSWORD:'a-strong-test-password-for-shop-a',
    // Global legacy values must never leak into a configured tenant.
    DB:db(), BOT_TOKEN:'legacy-token', TELEGRAM_WEBHOOK_SECRET:'legacy-secret',
    ADMIN_DASHBOARD_PASSWORD:'a-strong-legacy-password'
  };
}
function request(host,path,secret,body={update_id:1,message:{chat:{id:123,type:'private'},from:{id:123},text:'/start'}}) {
  return new Request('https://'+host+path,{
    method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},
    body:JSON.stringify(body)
  });
}

test('multi-bot registry is strict and leaves legacy configuration unchanged',()=>{
  const env=config();
  assert.deepEqual(botRegistry(env).map(bot=>bot.id),['shop_a','shop_b']);
  assert.equal(selectBotEnvironment({BOT_TOKEN:'legacy'},'anything.example.com').BOT_TOKEN,'legacy');
  assert.equal(selectBotEnvironment(env,'unknown.example.com'),null);
  assert.equal(selectBotEnvironment(env,'shop-a.example.com').BOT_TOKEN,'one-token');
  assert.equal(selectBotEnvironment(env,'shop-a.example.com').DB,env.SHOP_A_DB);
  assert.equal(selectBotEnvironment(env,'shop-a.example.com').ADMIN_DASHBOARD_PASSWORD,env.SHOP_A_ADMIN_DASHBOARD_PASSWORD);
  assert.equal(selectBotEnvironment(env,'shop-b.example.com').ADMIN_DASHBOARD_PASSWORD,undefined);
  assert.equal(botEnvironment(env,{id:'shop_b'}).BANK_ACCOUNT_NO,undefined);
  assert.equal(allBotEnvironments(env).length,2);
  for(const entry of [
    '[{"id":"bad-name!","host":"a.example.com"}]',
    '[{"id":"a","host":"https://a.example.com"}]',
    '[{"id":"a","host":"a.example.com:443"}]',
    '[{"id":"a","host":"a.example.com"},{"id":"b","host":"a.example.com"}]',
    '[{"id":"a","host":"a.example.com"},{"id":"a","host":"b.example.com"}]',
    'not json','[]'
  ]) assert.throws(()=>botRegistry({MULTI_BOTS:entry}));
});

test('multi-bot rejects shared storage and incomplete credentials',()=>{
  const env=config();
  env.SHOP_B_DB=env.SHOP_A_DB;
  assert.throws(()=>allBotEnvironments(env),/D1 bindings must be different/);
  env.SHOP_B_DB=db();
  delete env.SHOP_B_TELEGRAM_WEBHOOK_SECRET;
  assert.throws(()=>allBotEnvironments(env),/Missing per-bot Telegram/);
  const turso=config();
  delete turso.SHOP_A_DB;delete turso.SHOP_B_DB;
  turso.SHOP_A_TURSO_DATABASE_URL='libsql://shared.example.com';
  turso.SHOP_B_TURSO_DATABASE_URL='libsql://shared.example.com';
  turso.SHOP_A_TURSO_AUTH_TOKEN='key-a';
  turso.SHOP_B_TURSO_AUTH_TOKEN='key-b';
  assert.throws(()=>allBotEnvironments(turso),/Turso databases must be different/);
});

test('per-bot Telegram webhook auth, token and locale DB are isolated',async t=>{
  const env=config(),calls=[];
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    calls.push(String(url));
    return Response.json({ok:true,result:true});
  };
  t.after(()=>{globalThis.fetch=oldFetch;});
  const ctx={waitUntil(){}};
  assert.equal((await worker.fetch(request('unknown.example.com','/telegram/webhook','one-secret'),env,ctx)).status,404);
  assert.equal((await worker.fetch(request('shop-b.example.com','/telegram/webhook','one-secret'),env,ctx)).status,401);
  assert.equal((await worker.fetch(request('shop-a.example.com','/telegram/webhook','legacy-secret'),env,ctx)).status,401);
  assert.equal((await worker.fetch(request('shop-a.example.com','/telegram/webhook','one-secret'),env,ctx)).status,200);
  assert.equal(env.SHOP_A_DB.calls.length>0,true);
  assert.equal(env.SHOP_B_DB.calls.length,0);
  assert.equal((await worker.fetch(request('shop-b.example.com','/telegram/webhook','two-secret'),env,ctx)).status,200);
  assert.ok(env.SHOP_B_DB.calls.length>0);
  assert.ok(calls.some(url=>url.includes('/botone-token/sendMessage')));
  assert.ok(calls.some(url=>url.includes('/bottwo-token/sendMessage')));
  assert.ok(!calls.some(url=>url.includes('/botlegacy-token/')));
  assert.equal(env.DB.calls.length,0);
});

test('bank and dashboard credentials are never inherited between hosts',async()=>{
  const env=config(),ctx={waitUntil(){}};
  const payment=(host,key)=>new Request('https://'+host+'/sepay/webhook',{
    method:'POST',headers:{Authorization:'Apikey '+key},
    body:'{}'
  });
  assert.equal((await worker.fetch(payment('shop-a.example.com','bank-b'),env,ctx)).status,401);
  assert.equal((await worker.fetch(payment('shop-b.example.com','bank-a'),env,ctx)).status,401);
  const a=await worker.fetch(new Request('https://shop-a.example.com/admin'),env,ctx);
  assert.equal(a.status,200);
  const b=await worker.fetch(new Request('https://shop-b.example.com/admin'),env,ctx);
  assert.equal(b.status,503);
  assert.equal((await worker.fetch(new Request('https://unknown.example.com/healthz'),env,ctx)).status,404);
});

test('Node adapter selects per-host database before handling requests',async()=>{
  const env=config();
  assert.equal((await handleRequest(new Request('https://shop-a.example.com/healthz'),{env})).status,200);
  assert.equal((await handleRequest(new Request('https://shop-b.example.com/healthz'),{env})).status,200);
  assert.equal((await handleRequest(new Request('https://unknown.example.com/healthz'),{env})).status,404);
  assert.equal((await handleRequest(new Request('https://shop-a.example.com/healthz'),{
    env:{...env,MULTI_BOTS:'broken JSON'}
  })).status,503);
});
