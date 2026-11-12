import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const schema = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url),'utf8');
const envDefaults = {
  BOT_TOKEN:'fake_test_bot_token', TELEGRAM_WEBHOOK_SECRET:'known-secret',
  SEPAY_WEBHOOK_API_KEY:'sepay-secret', ADMIN_TELEGRAM_ID:'42',
  BANK_BIN:'970422', BANK_ACCOUNT_NO:'12345678', BANK_ACCOUNT_NAME:'TEST'
};

function d1TestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  return {
    raw:sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const binding = (...params) => ({
        first:async () => statement.get(...params) || null,
        all:async () => ({ results: statement.all(...params) }),
        run:async () => {
          const result = statement.run(...params);
          return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        }
      });
      return { bind:binding, first:async () => binding().first(), all:async () => binding().all(), run:async () => binding().run() };
    },
    async batch(statements) {
      // The Worker uses D1's atomic batch. The mock statements are already bound objects.
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
    }
  };
}
function request(path, payload, headers = {}) {
  return new Request('https://test.workers.dev' + path, {
    method:'POST', headers: { 'Content-Type':'application/json', ...headers }, body:JSON.stringify(payload)
  });
}
function telegramRequest(payload) { return request('/telegram/webhook',payload,{'X-Telegram-Bot-Api-Secret-Token':'known-secret'}); }
function sepayRequest(payload, auth='Apikey sepay-secret') { return request('/sepay/webhook',payload,{Authorization:auth}); }
function context() { const tasks=[]; return {waitUntil:p=>tasks.push(p), async done(){ await Promise.all(tasks); }}; }
function mockTelegram(t) {
  const calls=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (url,options) => {
    calls.push({ url:String(url), method:String(url).split('/').pop(), data:JSON.parse(options.body) });
    return Response.json({ ok:true,result:true });
  };
  t.after(()=> { globalThis.fetch=original; });
  return calls;
}

test('health and authentication reject unauthenticated webhooks',async () => {
  const env={ ...envDefaults,DB:d1TestDb() };
  const ctx=context();
  assert.equal((await worker.fetch(new Request('https://test.workers.dev/healthz'),env,ctx)).status,200);
  assert.equal((await worker.fetch(request('/telegram/webhook',{update_id:1}),env,ctx)).status,401);
  assert.equal((await worker.fetch(sepayRequest({id:1},'Apikey wrong'),env,ctx)).status,401);
  assert.equal((await worker.fetch(request('/other',{}),env,ctx)).status,404);
});

test('SePay can settle a physical order exactly once with authenticated matching fields',async t => {
  const calls=mockTelegram(t), DB=d1TestDb(), env={ ...envDefaults, DB }, ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Mug','physical',50000)").run();
  const update={ update_id:1,callback_query:{ id:'cb1',from:{id:99},data:'buy:1',message:{chat:{id:99}} } };
  assert.equal((await worker.fetch(telegramRequest(update),env,ctx)).status,200);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  assert.match(order.id,/^E[A-F0-9]{12}$/);
  const event={id:991,transferType:'in',accountNumber:'12345678',transferAmount:50000,content:'THANH TOAN '+order.id};
  assert.equal((await (await worker.fetch(sepayRequest({...event,transferAmount:10000}),env,ctx)).json()).matched,false);
  assert.equal((await (await worker.fetch(sepayRequest({...event,accountNumber:'8888'}),env,ctx)).json()).matched,false);
  assert.equal((await (await worker.fetch(sepayRequest({...event,transferType:'out'}),env,ctx)).json()).matched,false);
  assert.equal((await (await worker.fetch(sepayRequest(event),env,ctx)).json()).matched,true);
  await ctx.done();
  assert.equal(DB.raw.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'PAID');
  assert.equal((await (await worker.fetch(sepayRequest(event),env,context())).json()).matched,false);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM payment_events').get().n,1);
  assert.ok(calls.some(c=>c.method==='sendMessage' && String(c.data.text).includes('Đã nhận')));
});

test('Stars checkout uses XTR, reserves key, fulfills once and protects /mykey',async t => {
  const calls=mockTelegram(t), DB=d1TestDb(), env={ ...envDefaults,DB },ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',25)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'PRIVATE-LICENSE-001')").run();
  const buy={update_id:2,callback_query:{id:'cb2',from:{id:77},data:'buy:1',message:{chat:{id:77}}}};
  assert.equal((await worker.fetch(telegramRequest(buy),env,ctx)).status,200);
  const invoice=calls.find(c=>c.method==='sendInvoice');
  assert.equal(invoice.data.currency,'XTR');
  assert.equal(invoice.data.prices[0].amount,25);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  assert.equal(DB.raw.prepare('SELECT reserved_order_id FROM digital_inventory').get().reserved_order_id,order.id);
  await worker.fetch(telegramRequest({update_id:3,pre_checkout_query:{id:'check',from:{id:77},currency:'XTR',invoice_payload:order.id,total_amount:25}}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,true);
  await worker.fetch(telegramRequest({update_id:4,pre_checkout_query:{id:'bad',from:{id:999},currency:'XTR',invoice_payload:order.id,total_amount:25}}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,false);
  const paid={update_id:5,message:{chat:{id:77,type:'private'},from:{id:77},successful_payment:{currency:'XTR',invoice_payload:order.id,total_amount:25,telegram_payment_charge_id:'charge-123'}}};
  assert.equal((await worker.fetch(telegramRequest(paid),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT status FROM orders').get().status,'FULFILLED');
  await worker.fetch(telegramRequest({...paid,update_id:6}),env,ctx);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM payment_events').get().n,1);
  await worker.fetch(telegramRequest({update_id:7,message:{chat:{id:88,type:'private'},from:{id:88},text:'/mykey '+order.id}}),env,ctx);
  assert.equal(calls.at(-1).data.text,'Không tìm thấy key được phép truy cập.');
  await worker.fetch(telegramRequest({update_id:8,message:{chat:{id:77,type:'private'},from:{id:77},text:'/mykey '+order.id}}),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('PRIVATE-LICENSE-001'));
});

test('unprivileged users cannot create products',async t => {
  mockTelegram(t);
  const DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  const user={update_id:9,message:{chat:{id:99,type:'private'},from:{id:99},text:'/addphysical Mug | 1000 | Details'}};
  await worker.fetch(telegramRequest(user),env,ctx);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM products').get().n,0);
  const admin={...user,update_id:10,message:{...user.message,chat:{id:42,type:'private'},from:{id:42}}};
  await worker.fetch(telegramRequest(admin),env,ctx);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM products').get().n,1);
});
