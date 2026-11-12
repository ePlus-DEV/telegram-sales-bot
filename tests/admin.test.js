import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {handleRequest} from '../src/runtime.js';
import {createServer} from '../src/server.js';

function testDb() {
  const sqlite=new DatabaseSync(':memory:');
  for(let n=1;n<=5;n++) {
    const file=new URL('../migrations/000'+n+'_'+({
      1:'initial',2:'notification_outbox',3:'purchase_intents',
      4:'payment_reconciliation',5:'web_admin'
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
