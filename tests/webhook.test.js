import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const schema = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url),'utf8');
const schemaV2 = readFileSync(new URL('../migrations/0002_notification_outbox.sql', import.meta.url),'utf8');
const envDefaults = {
  BOT_TOKEN:'fake_test_bot_token', TELEGRAM_WEBHOOK_SECRET:'known-secret',
  SEPAY_WEBHOOK_API_KEY:'sepay-secret', ADMIN_TELEGRAM_ID:'42',
  BANK_BIN:'970422', BANK_ACCOUNT_NO:'12345678', BANK_ACCOUNT_NAME:'TEST'
};

function d1TestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(schemaV2);
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
  assert.equal(calls.filter(c=>c.method==='sendMessage' && String(c.data.text).includes('PRIVATE-LICENSE-001')).length,1,'duplicate Stars payment does not resend key');
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

test('Stars paid order survives message send failure and retries once on webhook replay', async t => {
  const calls=mockTelegram(t), DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Pass','digital',30)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'ONE-SECRET')").run();
  await worker.fetch(telegramRequest({update_id:100,callback_query:{id:'b100',from:{id:63},data:'buy:1',message:{chat:{id:63}}}}),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  const payment={update_id:101,message:{chat:{id:63,type:'private'},from:{id:63},successful_payment:{
    currency:'XTR',invoice_payload:order.id,total_amount:30,telegram_payment_charge_id:'stars-charge-one'
  }}};
  const mockFetch=globalThis.fetch;
  let failureCount=0;
  globalThis.fetch=(url,options)=>{
    if (String(url).endsWith('/sendMessage') && JSON.parse(options.body).text?.includes('ONE-SECRET') && failureCount++===0)
      return Response.json({ok:false,description:'test: Telegram unavailable'}, {status:503});
    return mockFetch(url,options);
  };
  assert.equal((await worker.fetch(telegramRequest(payment),env,ctx)).status,500);
  assert.equal(DB.raw.prepare('SELECT status FROM orders').get().status,'FULFILLED','the payment and key are durable');
  assert.equal(DB.raw.prepare('SELECT state FROM notification_outbox').get().state,'PENDING');
  assert.equal((await worker.fetch(telegramRequest({...payment,update_id:102}),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT state FROM notification_outbox').get().state,'SENT');
  assert.equal(calls.filter(c=>c.method==='sendMessage' && c.data.text.includes('ONE-SECRET')).length,1);
  await worker.fetch(telegramRequest({...payment,update_id:103}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='sendMessage' && c.data.text.includes('ONE-SECRET')).length,1);
});

test('SePay replay resumes notifications after failure without another payment settlement',async t => {
  const calls=mockTelegram(t), DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Mug','physical',70000)").run();
  await worker.fetch(telegramRequest({update_id:200,callback_query:{id:'b200',from:{id:21},data:'buy:1',message:{chat:{id:21}}}}),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  const event={id:303,transferType:'in',accountNumber:'12345678',transferAmount:70000,content:'PAY '+order.id};
  const mockFetch=globalThis.fetch;
  let failures=0;
  globalThis.fetch=(url,options)=>{
    if (String(url).endsWith('/sendMessage') && JSON.parse(options.body).text?.includes('Đã nhận') && failures++===0)
      return Response.json({ok:false,description:'test: Telegram unavailable'},{status:503});
    return mockFetch(url,options);
  };
  assert.equal((await worker.fetch(sepayRequest(event),env,ctx)).status,500);
  assert.equal(DB.raw.prepare('SELECT status FROM orders').get().status,'PAID');
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM payment_events WHERE provider='sepay'").get().n,1);
  assert.equal((await (await worker.fetch(sepayRequest(event),env,ctx)).json()).matched,false);
  assert.equal(DB.raw.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state='SENT'").get().n,2);
  await worker.fetch(sepayRequest(event),env,ctx);
  assert.equal(calls.filter(c=>c.method==='sendMessage' && c.data.text.includes('Đã nhận')).length,1);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM payment_events').get().n,1);
});

test('recovery command is admin-only; scheduled retry flushes leased notifications',async t => {
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Poster','physical',10000)").run();
  DB.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd,status,payment_ref) VALUES('EABCDEF123456','15',1,'physical','sepay',10000,'PAID','123')").run();
  DB.raw.prepare("INSERT INTO notification_outbox(order_id,kind,recipient_id,state,lease_until) VALUES('EABCDEF123456','physical_paid_customer','15','SENDING',datetime('now','-1 minute'))").run();
  const notAdmin={update_id:301,message:{chat:{id:15,type:'private'},from:{id:15},text:'/retryalerts'}};
  await worker.fetch(telegramRequest(notAdmin),env,ctx);
  assert.equal(DB.raw.prepare('SELECT state FROM notification_outbox').get().state,'SENDING');
  await worker.scheduled({},env,ctx);
  await ctx.done();
  assert.equal(DB.raw.prepare('SELECT state FROM notification_outbox').get().state,'SENT');
  assert.ok(calls.some(c=>c.method==='sendMessage' && c.data.text.includes('Đã nhận')));
});
