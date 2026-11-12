import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const schema = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url),'utf8');
const schemaV2 = readFileSync(new URL('../migrations/0002_notification_outbox.sql', import.meta.url),'utf8');
const schemaV3 = readFileSync(new URL('../migrations/0003_purchase_intents.sql', import.meta.url),'utf8');
const schemaV4 = readFileSync(new URL('../migrations/0004_payment_reconciliation.sql', import.meta.url),'utf8');
const schemaV6 = readFileSync(new URL('../migrations/0006_locales.sql', import.meta.url),'utf8');
const envDefaults = {
  BOT_TOKEN:'fake_test_bot_token', TELEGRAM_WEBHOOK_SECRET:'known-secret',
  SEPAY_WEBHOOK_API_KEY:'sepay-secret', ADMIN_TELEGRAM_ID:'42',
  BANK_BIN:'970422', BANK_ACCOUNT_NO:'12345678', BANK_ACCOUNT_NAME:'TEST'
};

function d1TestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(schemaV2);
  sqlite.exec(schemaV3);
  sqlite.exec(schemaV4);
  sqlite.exec(schemaV6);
  let batchQueue = Promise.resolve();
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
    batch(statements) {
      // Single local SQLite connection: serialize writes as a D1/libSQL
      // transactional service would, rather than nesting BEGIN across awaits.
      const runBatch = async () => {
        sqlite.exec('BEGIN');
        try {
          const out = [];
          for (const statement of statements) out.push(await statement.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
      };
      const transaction = batchQueue.then(runBatch,runBatch);
      batchQueue = transaction.catch(() => {});
      return transaction;
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
    return Response.json({ ok:true,result:String(url).endsWith('/createInvoiceLink') ? 'https://t.me/$TEST-INVOICE' : true });
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
  const invoice=calls.find(c=>c.method==='createInvoiceLink');
  assert.equal(invoice.data.currency,'XTR');
  assert.equal(invoice.data.prices[0].amount,25);
  assert.ok(calls.some(c=>c.method==='sendMessage' && c.data.reply_markup?.inline_keyboard?.[0]?.[0]?.url==='https://t.me/$TEST-INVOICE'));
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

test('replayed and concurrent callback creates only one physical order',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Mug','physical',50000)").run();
  const cb={update_id:400,callback_query:{id:'same-callback',from:{id:99},data:'buy:1',message:{chat:{id:99,type:'private'}}}};
  const responses=await Promise.all([worker.fetch(telegramRequest(cb),env,ctx),worker.fetch(telegramRequest({...cb,update_id:401}),env,ctx)]);
  assert.deepEqual(responses.map(r=>r.status),[200,200]);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM purchase_intents').get().n,1);
  const order=DB.raw.prepare('SELECT id FROM orders').get();
  assert.equal(calls.filter(c=>c.method==='sendMessage' && c.data.text.includes('Đơn '+order.id)).length,2);
});

test('replayed Stars Buy callback reuses invoice and precheckout permits one unique query',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',42)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'SECRET')").run();
  const buy={update_id:402,callback_query:{id:'same-stars',from:{id:71},data:'buy:1',message:{chat:{id:71,type:'private'}}}};
  await Promise.all([worker.fetch(telegramRequest(buy),env,ctx),worker.fetch(telegramRequest({...buy,update_id:403}),env,ctx)]);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM digital_inventory WHERE reserved_order_id IS NOT NULL').get().n,1);
  const id=DB.raw.prepare('SELECT id FROM orders').get().id;
  const q={id:'pc1',from:{id:71},currency:'XTR',invoice_payload:id,total_amount:42};
  await worker.fetch(telegramRequest({update_id:404,pre_checkout_query:q}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,true);
  await worker.fetch(telegramRequest({update_id:405,pre_checkout_query:q}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,true);
  await worker.fetch(telegramRequest({update_id:406,pre_checkout_query:{...q,id:'pc2'}}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,false);
  await worker.fetch(telegramRequest({update_id:407,message:{chat:{id:71,type:'private'},from:{id:71},text:'/invoice '+id}}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='createInvoiceLink').length,1);
  await worker.fetch(telegramRequest({update_id:408,message:{chat:{id:88,type:'private'},from:{id:88},text:'/invoice '+id}}),env,ctx);
  assert.equal(calls.at(-1).data.text,'Không tìm thấy hóa đơn của bạn.');
});

test('failed Telegram invoice creation is recoverable without a second order or key',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',10)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'SECRET')").run();
  const cb={update_id:410,callback_query:{id:'retry-me',from:{id:55},data:'buy:1',message:{chat:{id:55,type:'private'}}}};
  const original=globalThis.fetch;let fail=0;
  globalThis.fetch=(url,opts)=>(String(url).endsWith('/createInvoiceLink') && fail++===0)
    ? Response.json({ok:false,description:'test failed'},{status:503}) : original(url,opts);
  assert.equal((await worker.fetch(telegramRequest(cb),env,ctx)).status,500);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal((await worker.fetch(telegramRequest({...cb,update_id:411}),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,1);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM digital_inventory WHERE reserved_order_id IS NOT NULL').get().n,1);
  assert.ok(DB.raw.prepare('SELECT invoice_url FROM purchase_intents').get().invoice_url);
  assert.equal(calls.filter(c=>c.method==='createInvoiceLink').length,1);
});

test('callback acknowledgement outage does not lose purchases; group callbacks rejected',async t=>{
  mockTelegram(t);const DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Book','physical',20000)").run();
  const original=globalThis.fetch;
  globalThis.fetch=(url,opts)=>String(url).endsWith('/answerCallbackQuery')
    ? Response.json({ok:false},{status:502}) : original(url,opts);
  const group={update_id:412,callback_query:{id:'group',from:{id:22},data:'buy:1',message:{chat:{id:-1000,type:'supergroup'}}}};
  assert.equal((await worker.fetch(telegramRequest(group),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,0);
  const direct={update_id:413,callback_query:{id:'direct',from:{id:22},data:'buy:1',message:{chat:{id:22,type:'private'}}}};
  assert.equal((await worker.fetch(telegramRequest(direct),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT count(*) AS n FROM orders').get().n,1);
});

test('legacy Stars invoices from before migration 0003 remain payable exactly once',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Old key','digital',10)").run();
  const id='EABCDEF654321';
  DB.raw.prepare(
    "INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars) VALUES(?,? ,1,'digital','stars',10)"
  ).run(id,'81');
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value,reserved_order_id) VALUES(1,'OLD-KEY',?)").run(id);
  const q={id:'legacy-pc1',from:{id:81},currency:'XTR',invoice_payload:id,total_amount:10};
  await worker.fetch(telegramRequest({update_id:430,pre_checkout_query:q}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,true);
  assert.equal(DB.raw.prepare('SELECT callback_id FROM purchase_intents WHERE order_id=?').get(id).callback_id,'legacy:'+id);
  await worker.fetch(telegramRequest({update_id:431,pre_checkout_query:{...q,id:'legacy-pc2'}}),env,ctx);
  assert.equal(calls.filter(c=>c.method==='answerPreCheckoutQuery').at(-1).data.ok,false);
});
test('a paid physical order never re-displays the bank QR on callback replay',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Book','physical',10000)").run();
  const cb={update_id:432,callback_query:{id:'once-paid',from:{id:86},data:'buy:1',message:{chat:{id:86,type:'private'}}}};
  await worker.fetch(telegramRequest(cb),env,ctx);
  const id=DB.raw.prepare('SELECT id FROM orders').get().id;
  DB.raw.prepare("UPDATE orders SET status='PAID',payment_ref='refund-check' WHERE id=?").run(id);
  await worker.fetch(telegramRequest({...cb,update_id:433}),env,ctx);
  const last=calls.filter(c=>c.method==='sendMessage').at(-1).data.text;
  assert.match(last,/Không chuyển khoản lại/);
  assert.ok(!last.includes('QR:'));
});

// Payment reconciliation tests use a real in-memory SQLite schema and mock Telegram API.
test('unapproved expired Stars reservation releases key and checkout is refused', async t=>{
  const calls=mockTelegram(t), DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Expired license','digital',20)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'RESERVED-KEY')").run();
  const buy={update_id:501,callback_query:{id:'buy-expire',from:{id:87},data:'buy:1',message:{chat:{id:87,type:'private'}}}};
  await worker.fetch(telegramRequest(buy),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  DB.raw.prepare("UPDATE orders SET created_at=datetime('now','-2 days') WHERE id=?").run(order.id);
  const result=await worker.scheduled({},env,ctx);
  await ctx.done();
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM order_expirations WHERE order_id=?').get(order.id).n,1);
  assert.equal(DB.raw.prepare('SELECT reserved_order_id FROM digital_inventory').get().reserved_order_id,null);
  await worker.fetch(telegramRequest({update_id:502,pre_checkout_query:{
    id:'expired-precheck',from:{id:87},currency:'XTR',invoice_payload:order.id,total_amount:20
  }}),env,ctx);
  assert.equal(calls.filter(x=>x.method==='answerPreCheckoutQuery').at(-1).data.ok,false);
  await worker.fetch(telegramRequest({update_id:503,message:{chat:{id:87,type:'private'},from:{id:87},text:'/invoice '+order.id}}),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('hết hạn'));
});

test('authorized Stars checkout is never automatically expired even if very old',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Hold','digital',9)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'HELD')").run();
  await worker.fetch(telegramRequest({update_id:504,callback_query:{id:'buy-held',from:{id:70},data:'buy:1',message:{chat:{id:70,type:'private'}}}}),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  await worker.fetch(telegramRequest({update_id:505,pre_checkout_query:{id:'approved-one',from:{id:70},currency:'XTR',invoice_payload:order.id,total_amount:9}}),env,ctx);
  assert.equal(calls.filter(x=>x.method==='answerPreCheckoutQuery').at(-1).data.ok,true);
  DB.raw.prepare("UPDATE orders SET created_at=datetime('now','-7 days') WHERE id=?").run(order.id);
  await worker.scheduled({},env,ctx);await ctx.done();
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM order_expirations').get().n,0);
  assert.equal(DB.raw.prepare('SELECT reserved_order_id FROM digital_inventory').get().reserved_order_id,order.id);
});

test('late and mismatched SePay deposits are reviewed, not automatically credited',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Poster','physical',10000)").run();
  await worker.fetch(telegramRequest({update_id:506,callback_query:{id:'buy-poster',from:{id:88},data:'buy:1',message:{chat:{id:88,type:'private'}}}}),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  const tx={id:800,transferType:'in',accountNumber:'12345678',transferAmount:10000,content:'PAY '+order.id};
  const wrong=await worker.fetch(sepayRequest({...tx,id:801,transferAmount:9000}),env,ctx);
  assert.equal((await wrong.json()).review,true);
  DB.raw.prepare("UPDATE orders SET created_at=datetime('now','-2 hours') WHERE id=?").run(order.id);
  await worker.scheduled({},env,ctx);await ctx.done();
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM order_expirations').get().n,1);
  const late=await worker.fetch(sepayRequest(tx),env,ctx);
  assert.equal((await late.json()).review,true);
  assert.equal(DB.raw.prepare('SELECT status FROM orders').get().status,'PENDING');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM payment_events').get().n,0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM bank_payment_reviews').get().n,2);
  await worker.fetch(sepayRequest(tx),env,ctx);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM bank_payment_reviews').get().n,2);
  await worker.fetch(telegramRequest({update_id:507,message:{chat:{id:42,type:'private'},from:{id:42},text:'/bankreviews'}}),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('EXPIRED_ORDER'));
  await worker.fetch(telegramRequest({update_id:508,message:{chat:{id:42,type:'private'},from:{id:42},text:'/ackbank 800'}}),env,ctx);
  assert.ok(DB.raw.prepare('SELECT acknowledged_at FROM bank_payment_reviews WHERE event_id=?').get('800').acknowledged_at);
});

test('Stars payment received after expiry is held for manual review, not given a reused key',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Late key','digital',35)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'ONE-KEY')").run();
  await worker.fetch(telegramRequest({update_id:510,callback_query:{id:'late-key',from:{id:89},data:'buy:1',message:{chat:{id:89,type:'private'}}}}),env,ctx);
  const order=DB.raw.prepare('SELECT * FROM orders').get();
  DB.raw.prepare("UPDATE orders SET created_at=datetime('now','-2 days') WHERE id=?").run(order.id);
  await worker.scheduled({},env,ctx);await ctx.done();
  await worker.fetch(telegramRequest({update_id:511,message:{chat:{id:89,type:'private'},from:{id:89},successful_payment:{
    currency:'XTR',invoice_payload:order.id,total_amount:35,telegram_payment_charge_id:'late-charge'
  }}}),env,ctx);
  assert.equal(DB.raw.prepare('SELECT status FROM orders').get().status,'PAID');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM digital_inventory WHERE delivered_order_id IS NOT NULL').get().n,0);
  assert.ok(calls.some(x=>x.method==='sendMessage' && x.data.text?.includes('chờ hỗ trợ giao hàng')));
});

test('admin Stars refund is one-shot; fulfilled goods cannot be refunded automatically',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Refundable','digital',50)").run();
  DB.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('E111111111111','91',1,'digital','stars',50,'PAID','charge-refund-a')").run();
  const cmd=(n,text,admin=true)=>({update_id:n,message:{chat:{id:admin?42:99,type:'private'},from:{id:admin?42:99},text}});
  await worker.fetch(telegramRequest(cmd(520,'/refundstars E111111111111',false)),env,ctx);
  assert.equal(calls.filter(x=>x.method==='refundStarPayment').length,0);
  await worker.fetch(telegramRequest(cmd(521,'/refundstars E111111111111')),env,ctx);
  assert.equal(calls.filter(x=>x.method==='refundStarPayment').length,1);
  assert.deepEqual(calls.find(x=>x.method==='refundStarPayment').data,{
    user_id:91,telegram_payment_charge_id:'charge-refund-a'
  });
  assert.equal(DB.raw.prepare('SELECT state FROM star_refunds').get().state,'CONFIRMED');
  await worker.fetch(telegramRequest(cmd(522,'/refundstars E111111111111')),env,ctx);
  assert.equal(calls.filter(x=>x.method==='refundStarPayment').length,1);
  DB.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('E222222222222','92',1,'digital','stars',50,'FULFILLED','charge-b')").run();
  await worker.fetch(telegramRequest(cmd(523,'/refundstars E222222222222')),env,ctx);
  assert.equal(calls.filter(x=>x.method==='refundStarPayment').length,1);
});

test('unknown Stars refund result becomes NEEDS_REVIEW and is never blindly re-tried',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Key','digital',50)").run();
  DB.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('E333333333333','93',1,'digital','stars',50,'PAID','charge-unknown')").run();
  const original=globalThis.fetch;
  globalThis.fetch=(url,opts)=>String(url).endsWith('/refundStarPayment') ?
    Response.json({ok:false,description:'timeout'},{status:504}) : original(url,opts);
  const command=(n,text)=>telegramRequest({update_id:n,message:{chat:{id:42,type:'private'},from:{id:42},text}});
  assert.equal((await worker.fetch(command(524,'/refundstars E333333333333'),env,ctx)).status,200);
  assert.equal(DB.raw.prepare('SELECT state FROM star_refunds').get().state,'NEEDS_REVIEW');
  await worker.fetch(command(525,'/refundstars E333333333333'),env,ctx);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM star_refunds').get().n,1);
  assert.equal(calls.filter(x=>x.method==='refundStarPayment').length,0,'mock only captures successful calls');
  await worker.fetch(command(526,'/refundreviews'),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('NEEDS_REVIEW'));
});

test('language auto-detection and manual override persist across Telegram updates',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  const message=(update_id,text,code='en-US')=>telegramRequest({
    update_id,message:{from:{id:701,language_code:code},chat:{id:701,type:'private'},text}
  });
  assert.equal((await worker.fetch(message(601,'/start'),env,ctx)).status,200);
  assert.ok(calls.at(-1).data.text.includes('Welcome to ePlus'));
  assert.deepEqual({...DB.raw.prepare('SELECT locale,source FROM user_locales WHERE user_id=?').get('701')},{
    locale:'en',source:'auto'
  });
  await worker.fetch(message(602,'/language'),env,ctx);
  assert.equal(calls.at(-1).data.reply_markup.inline_keyboard[0].length,2);
  await worker.fetch(message(603,'/lang vi'),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('tiếng Việt'));
  await worker.fetch(message(604,'/help'),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('Sản phẩm số'));
  assert.equal(DB.raw.prepare("SELECT source FROM user_locales WHERE user_id='701'").get().source,'manual');
  await worker.fetch(message(605,'/lang en','vi-VN'),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('Language set'));
  await worker.fetch(message(606,'/catalog','vi-VN'),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('No products yet'));
  await worker.fetch(telegramRequest({update_id:607,callback_query:{
    id:'change-language',from:{id:701,language_code:'en-US'},
    data:'lang:vi',message:{chat:{id:701,type:'private'}}
  }}),env,ctx);
  assert.equal(DB.raw.prepare("SELECT locale FROM user_locales WHERE user_id='701'").get().locale,'vi');
});

test('English buyers receive Stars invoice link and payment notification in English',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  DB.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',20)").run();
  DB.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'TEST-EN-KEY')").run();
  const buy=telegramRequest({update_id:610,callback_query:{
    id:'purchase-en',from:{id:702,language_code:'en'},data:'buy:1',
    message:{chat:{id:702,type:'private'}}
  }});
  assert.equal((await worker.fetch(buy,env,ctx)).status,200);
  assert.ok(calls.some(x=>x.method==='sendMessage'&&x.data.reply_markup?.inline_keyboard?.[0]?.[0]?.text==='⭐ Pay with Stars'));
  const order=DB.raw.prepare('SELECT id FROM orders').get().id;
  await worker.fetch(telegramRequest({update_id:611,message:{
    from:{id:702,language_code:'en'},chat:{id:702,type:'private'},
    successful_payment:{currency:'XTR',invoice_payload:order,total_amount:20,telegram_payment_charge_id:'en-charge-1'}
  }}),env,ctx);
  assert.ok(calls.some(x=>x.method==='sendMessage'&&x.data.text?.includes('Payment confirmed and delivered')));
  assert.ok(calls.some(x=>x.method==='sendMessage'&&x.data.text?.includes('TEST-EN-KEY')));
});

test('automatic Vietnamese fallback for unsupported Telegram locales',async t=>{
  const calls=mockTelegram(t),DB=d1TestDb(),env={...envDefaults,DB},ctx=context();
  await worker.fetch(telegramRequest({update_id:612,message:{
    from:{id:703,language_code:'fr-FR'},chat:{id:703,type:'private'},text:'/help'
  }}),env,ctx);
  assert.ok(calls.at(-1).data.text.includes('Sản phẩm số'));
  assert.equal(DB.raw.prepare("SELECT locale FROM user_locales WHERE user_id='703'").get().locale,'vi');
});
