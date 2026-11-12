import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {handleRequest} from '../src/runtime.js';
import {createServer} from '../src/server.js';

function testDb() {
  const sqlite=new DatabaseSync(':memory:');
  for(let n=1;n<=6;n++) {
    const file=new URL('../migrations/000'+n+'_'+({
      1:'initial',2:'notification_outbox',3:'purchase_intents',
      4:'payment_reconciliation',5:'web_admin',6:'locales'
    })[n]+'.sql',import.meta.url);
    sqlite.exec(readFileSync(file,'utf8'));
  }
  let queue=Promise.resolve();
  return {
    raw:sqlite,
    prepare(sql) {
      const stmt=sqlite.prepare(sql);
      const bound=(...params)=>({
        first:async()=>stmt.get(...params)||null,
        all:async()=>({results:stmt.all(...params)}),
        run:async()=>{
          const r=stmt.run(...params);
          return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid||0)}};
        }
      });
      return {bind:bound,first:async()=>bound().first(),
        all:async()=>bound().all(),run:async()=>bound().run()};
    },
    batch(statements) {
      const run=async()=>{
        sqlite.exec('BEGIN');
        try {
          const out=[];
          for(const stmt of statements)out.push(await stmt.run());
          sqlite.exec('COMMIT');
          return out;
        } catch(error){sqlite.exec('ROLLBACK');throw error;}
      };
      const next=queue.then(run,run);
      queue=next.catch(()=>{});
      return next;
    }
  };
}
const base='https://admin.example.test';
const ctx={waitUntil(){}};
const password='test-secret-password-32-characters';
function env(db){return {DB:db,ADMIN_DASHBOARD_PASSWORD:password};}
function get(path,db,headers={}) {
  return worker.fetch(new Request(base+path,{headers}),env(db),ctx);
}
function post(path,data,db,cookie='',extra={}) {
  return worker.fetch(new Request(base+path,{
    method:'POST',
    headers:{
      'content-type':'application/x-www-form-urlencoded',
      origin:base,
      ...(cookie?{cookie}:{}),
      ...extra
    },
    body:new URLSearchParams(data).toString()
  }),env(db),ctx);
}
async function login(db) {
  const response=await post('/admin/login',{password},db);
  assert.equal(response.status,303);
  const set=response.headers.get('set-cookie');
  assert.match(set,/HttpOnly/);
  assert.match(set,/SameSite=Strict/);
  assert.match(set,/Secure/);
  const cookie=set.split(';')[0];
  const html=await (await get('/admin',db,{cookie})).text();
  const match=html.match(/name="csrf" value="([a-f0-9]{48})"/);
  assert.ok(match,'dashboard includes CSRF form token');
  return {cookie,csrf:match[1]};
}

test('dashboard fails closed until a real secret is configured',async()=>{
  const db=testDb();
  const response=await worker.fetch(new Request(base+'/admin'),{DB:db},ctx);
  assert.equal(response.status,503);
  assert.match(await response.text(),/ADMIN_DASHBOARD_PASSWORD/);
});

test('unauthenticated dashboard shows login, not private products or keys',async()=>{
  const db=testDb();
  db.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Hidden','digital',10)").run();
  db.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'VERY-PRIVATE-KEY')").run();
  const response=await get('/admin?tab=products',db);
  assert.equal(response.status,200);
  const text=await response.text();
  assert.match(text,/Đăng nhập quản trị/);
  assert.doesNotMatch(text,/VERY-PRIVATE-KEY|Hidden/);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});

test('login requires same-origin POST and rate-limits failed attempts',async()=>{
  const db=testDb();
  const cross=await post('/admin/login',{password},db,'',{origin:'https://malicious.test'});
  assert.equal(cross.status,403);
  for(let i=0;i<5;i++) {
    assert.equal((await post('/admin/login',{password:'wrong-password'},db)).status,401);
  }
  assert.equal((await post('/admin/login',{password},db)).status,429);
  assert.equal(db.raw.prepare("SELECT failures FROM admin_login_limits WHERE id='global'").get().failures,5);
});

test('session CSRF, secure product CRUD, inventory redaction and logout',async()=>{
  const db=testDb(),{cookie,csrf}=await login(db);
  const before=db.raw.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  assert.equal((await post('/admin/products/create',{
    csrf:'invalid',kind:'digital',name:'Bad',price:'11'
  },db,cookie)).status,403);
  assert.equal((await post('/admin/products/create',{
    csrf,kind:'digital',name:'Bad',price:'11'
  },db,cookie,{origin:'https://evil.test'})).status,403);
  assert.equal((await post('/admin/products/create',{
    csrf,kind:'digital',name:'Bad',price:'11'
  },db)).status,401);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM products').get().n,before);
  const save=await post('/admin/products/create',{
    csrf,kind:'digital',name:'<script>unsafe</script>',description:'Mã test',
    price:'25'
  },db,cookie);
  assert.equal(save.status,303);
  const product=db.raw.prepare('SELECT * FROM products').get();
  assert.equal(product.price_stars,25);
  assert.equal(product.price_vnd,0);
  const add=await post('/admin/stock/add',{
    csrf,product_id:String(product.id),key:'SECRET-LICENSE-123'
  },db,cookie);
  assert.equal(add.status,303);
  const productsHtml=await (await get('/admin?tab=products',db,{cookie})).text();
  assert.match(productsHtml,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(productsHtml,/<script>unsafe<\/script>/);
  assert.doesNotMatch(productsHtml,/SECRET-LICENSE-123/);
  const edit=await post('/admin/products/update',{
    csrf,id:String(product.id),name:'Edited license',description:'Hidden inventory',
    active:'0',price:'50'
  },db,cookie);
  assert.equal(edit.status,303);
  assert.deepEqual({...db.raw.prepare('SELECT name,price_stars,active FROM products').get()},{
    name:'Edited license',price_stars:50,active:0
  });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n,3);
  const logout=await post('/admin/logout',{csrf},db,cookie);
  assert.equal(logout.status,303);
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.match(await (await get('/admin',db,{cookie})).text(),/Đăng nhập quản trị/);
  assert.equal((await post('/admin/products/create',{
    csrf,kind:'physical',name:'Book',price:'1000'
  },db,cookie)).status,401);
});

test('dashboard only fulfills already-paid physical orders and reviews bank events',async()=>{
  const db=testDb(),{cookie,csrf}=await login(db);
  db.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Mug','physical',10000)").run();
  db.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',50)").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd,status,payment_ref) VALUES('EAAAAAAAAAAAA','10',1,'physical','sepay',10000,'PAID','13')").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd) VALUES('EBBBBBBBBBBBB','10',1,'physical','sepay',10000)").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('ECCCCCCCCCCCC','11',2,'digital','stars',50,'PAID','charge-x')").run();
  db.raw.prepare("INSERT INTO bank_payment_reviews(event_id,order_id,bank_account,amount_vnd,reason) VALUES('999','ENOTFOUND1234','12345678',10000,'UNKNOWN_ORDER')").run();
  assert.equal((await post('/admin/orders/fulfill',{csrf,order_id:'EBBBBBBBBBBBB'},db,cookie)).status,400);
  assert.equal((await post('/admin/orders/fulfill',{csrf,order_id:'ECCCCCCCCCCCC'},db,cookie)).status,400);
  assert.equal((await post('/admin/orders/fulfill',{csrf,order_id:'EAAAAAAAAAAAA'},db,cookie)).status,303);
  assert.equal(db.raw.prepare("SELECT status FROM orders WHERE id='EAAAAAAAAAAAA'").get().status,'FULFILLED');
  const review=await (await get('/admin?tab=reviews',db,{cookie})).text();
  assert.match(review,/UNKNOWN_ORDER/);
  assert.match(review,/E?NOTFOUND1234/);
  assert.equal((await post('/admin/reviews/ack',{csrf,event_id:'999'},db,cookie)).status,303);
  assert.ok(db.raw.prepare("SELECT acknowledged_at FROM bank_payment_reviews WHERE event_id='999'").get().acknowledged_at);
  const orders=await (await get('/admin?tab=orders',db,{cookie})).text();
  assert.match(orders,/EAAAAAAAAAAAA/);
  assert.doesNotMatch(orders,/charge-x/);
});

test('shared Fetch runtime can serve admin using an injected D1 binding',async()=>{
  const db=testDb();
  const response=await handleRequest(new Request(base+'/api/admin'),{
    path:'/admin',env:env(db)
  });
  assert.equal(response.status,200);
  assert.match(await response.text(),/Đăng nhập quản trị/);
});

test('Node HTTP adapter respects Host and proxy HTTPS origin for admin forms',async t=>{
  const db=testDb(),server=createServer(env(db));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const port=server.address().port;
  const origin='http://127.0.0.1:'+port;
  const response=await fetch(origin+'/admin/login',{
    method:'POST',
    headers:{origin,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({password}).toString(),
    redirect:'manual'
  });
  assert.equal(response.status,303);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  const bad=await fetch(origin+'/admin/login',{
    method:'POST',
    headers:{origin:'https://attacker.example','content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({password}).toString(),
    redirect:'manual'
  });
  assert.equal(bad.status,403);
});

test('English admin language works on login, product UI, notices and stored preferences',async()=>{
  const db=testDb();
  const loginScreen=await get('/admin?lang=en',db);
  assert.equal(loginScreen.status,200);
  assert.match(loginScreen.headers.get('set-cookie'),/eplus_admin_lang=en/);
  const html=await loginScreen.text();
  assert.match(html,/Admin sign in/);
  assert.match(html,/Admin password/);
  assert.match(html,/<html lang="en">/);
  const logged=await post('/admin/login?lang=en',{password},db);
  assert.equal(logged.status,303);
  const sessionCookie=logged.headers.get('set-cookie').split(';')[0];
  const prefCookie='eplus_admin_lang=en';
  const cookie=sessionCookie+'; '+prefCookie;
  const dashboard=await get('/admin?tab=products',db,{cookie});
  assert.equal(dashboard.status,200);
  const translated=await dashboard.text();
  assert.match(translated,/Products &amp; inventory|Products & inventory/);
  assert.match(translated,/Create product/);
  assert.doesNotMatch(translated,/Thêm sản phẩm/);
  const csrf=translated.match(/name="csrf" value="([a-f0-9]{48})"/)?.[1];
  assert.ok(csrf);
  const created=await post('/admin/products/create',{
    csrf,kind:'physical',name:'Sản phẩm đặc biệt',price:'10000'
  },db,cookie);
  assert.equal(created.status,303);
  const check=await (await get('/admin?tab=products',db,{cookie})).text();
  assert.match(check,/Product name/);
  assert.doesNotMatch(check,/Special product/);
  // Browser decodes numeric entities, but server never translates owner-entered names.
  assert.ok(check.includes('&#x'));
  const failure=await post('/admin/login?lang=en',{password:'wrong'},db);
  assert.equal(failure.status,401);
  assert.match(await failure.text(),/Invalid password/);
});

test('admin product search, filters and pagination are database-backed and safe',async()=>{
  const db=testDb(),{cookie}=await login(db);
  for(let i=1;i<=48;i++)
    db.raw.prepare('INSERT INTO products(name,kind,price_stars,price_vnd,active) VALUES(?,?,?,?,?)')
      .run('Widget '+i,i%2?'digital':'physical',i%2?10:0,i%2?0:1000,i%5?1:0);
  const first=await (await get('/admin?tab=products',db,{cookie})).text();
  assert.match(first,/Hiển thị 1/);
  assert.match(first,/Trang 1\/3/);
  assert.match(first,/page=2/);
  assert.match(first,/Widget 48/);
  assert.doesNotMatch(first,/Widget 1</);
  const second=await (await get('/admin?tab=products&page=2',db,{cookie})).text();
  assert.match(second,/Widget 28/);
  assert.doesNotMatch(second,/Widget 48/);
  const searched=await (await get('/admin?tab=products&q=Widget%2027&kind=digital',db,{cookie})).text();
  assert.match(searched,/Widget 27/);
  assert.doesNotMatch(searched,/Widget 26/);
  const hidden=await (await get('/admin?tab=products&active=0',db,{cookie})).text();
  assert.match(hidden,/Widget 45/);
  assert.doesNotMatch(hidden,/Widget 48/);
  const hostile=await (await get('/admin?tab=products&q=%3Cscript%3Ealert(1)%3C%2Fscript%3E',db,{cookie})).text();
  assert.doesNotMatch(hostile,/<script>alert\(1\)<\/script>/);
  assert.match(hostile,/&lt;script&gt;/);
});

test('order search filters include refund and expiry sidecar status; analytics avoids confirmed refunds',async()=>{
  const db=testDb(),{cookie}=await login(db);
  db.raw.prepare("INSERT INTO products(name,kind,price_vnd) VALUES('Mug','physical',15000)").run();
  db.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Key','digital',20)").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd,status,payment_ref) VALUES('EAAAAAAAAAAAA','76',1,'physical','sepay',15000,'PAID','bankref-1')").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('EBBBBBBBBBBBB','77',2,'digital','stars',20,'PAID','starref-1')").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars,status,payment_ref) VALUES('ECCCCCCCCCCCC','78',2,'digital','stars',30,'PAID','starref-2')").run();
  db.raw.prepare("INSERT INTO star_refunds(order_id,user_id,charge_id,state) VALUES('ECCCCCCCCCCCC','78','starref-2','CONFIRMED')").run();
  db.raw.prepare("INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd,status) VALUES('EDDDDDDDDDDD','79',1,'physical','sepay',15000,'PENDING')").run();
  db.raw.prepare("INSERT INTO order_expirations(order_id) VALUES('EDDDDDDDDDDD')").run();
  const overview=await (await get('/admin',db,{cookie})).text();
  assert.match(overview,/Ghi nhận VND/);
  assert.match(overview,/15.000/);
  assert.match(overview,/Ghi nhận Stars/);
  assert.match(overview,/Đơn đã ghi nhận thanh toán/);
  const onlyRefund=await (await get('/admin?tab=orders&status=REFUNDED',db,{cookie})).text();
  assert.match(onlyRefund,/ECCCCCCCCCCCC/);
  assert.doesNotMatch(onlyRefund,/EBBBBBBBBBBBB/);
  const expired=await (await get('/admin?tab=orders&status=EXPIRED',db,{cookie})).text();
  assert.match(expired,/EDDDDDDDDDDD/);
  assert.doesNotMatch(expired,/EAAAAAAAAAAAA/);
  const search=await (await get('/admin?tab=orders&q=76&provider=sepay',db,{cookie})).text();
  assert.match(search,/EAAAAAAAAAAAA/);
  assert.doesNotMatch(search,/EBBBBBBBBBBBB/);
});

test('bulk key intake is authenticated, CSRF-protected, limited and never renders or logs key values',async()=>{
  const db=testDb(),{cookie,csrf}=await login(db);
  db.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('License','digital',5)").run();
  const data={csrf,product_id:'1',keys:'SENSITIVE-K-001\nSENSITIVE-K-002\nSENSITIVE-K-003'};
  assert.equal((await post('/admin/stock/bulk',data,db)).status,401);
  assert.equal((await post('/admin/stock/bulk',{...data,csrf:'wrong'},db,cookie)).status,403);
  assert.equal((await post('/admin/stock/bulk',data,db,cookie,{origin:'https://evil.example'})).status,403);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM digital_inventory').get().n,0);
  assert.equal((await post('/admin/stock/bulk',data,db,cookie)).status,303);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM digital_inventory').get().n,3);
  assert.equal((await post('/admin/stock/bulk',data,db,cookie)).status,303);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM digital_inventory').get().n,3,'existing keys are ignored');
  assert.equal((await post('/admin/stock/bulk',{...data,keys:'DUPLICATE\nDUPLICATE'},db,cookie)).status,400);
  assert.equal((await post('/admin/stock/bulk',{...data,keys:Array.from({length:51},(_,i)=>'K'+i).join('\n')},db,cookie)).status,400);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM digital_inventory').get().n,3);
  const page=await (await get('/admin?tab=products',db,{cookie})).text();
  assert.match(page,/Nhập key hàng loạt/);
  assert.doesNotMatch(page,/SENSITIVE-K-00[123]/);
  const audits=db.raw.prepare('SELECT action,target_id FROM admin_audit').all();
  assert.ok(audits.some(x=>x.action==='STOCK_BULK_ADD'));
  assert.doesNotMatch(JSON.stringify(audits),/SENSITIVE-K-00/);
});

test('inventory CSV export never exposes key values and requires valid admin session',async()=>{
  const db=testDb();
  db.raw.prepare("INSERT INTO products(name,kind,price_stars) VALUES('Sensitive product','digital',10)").run();
  db.raw.prepare("INSERT INTO digital_inventory(product_id,secret_value) VALUES(1,'TOP-SECRET-KEY')").run();
  const denied=await get('/admin/export/inventory.csv',db);
  assert.equal(denied.status,401);
  const {cookie}=await login(db);
  const accepted=await get('/admin/export/inventory.csv',db,{cookie});
  assert.equal(accepted.status,200);
  assert.match(accepted.headers.get('content-type'),/text\/csv/);
  const csv=await accepted.text();
  assert.match(csv,/product_id,kind,total,available,reserved,delivered/);
  assert.match(csv,/1,digital,1,1,0,0/);
  assert.doesNotMatch(csv,/TOP-SECRET|Sensitive product/);
});

test('audit tab lists only safe mutation metadata and is available only after login',async()=>{
  const db=testDb(),{cookie,csrf}=await login(db);
  await post('/admin/products/create',{csrf,kind:'physical',name:'Book',price:'12000'},db,cookie);
  const publicAudit=await (await get('/admin?tab=audit',db)).text();
  assert.doesNotMatch(publicAudit,/PRODUCT_CREATE/);
  const privateAudit=await (await get('/admin?tab=audit',db,{cookie})).text();
  assert.match(privateAudit,/PRODUCT_CREATE/);
  assert.match(privateAudit,/Nhật ký thao tác/);
});
