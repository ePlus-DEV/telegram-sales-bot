import {
  dashboardConfigured,passwordMatches,loginBlocked,noteFailedLogin,createSession,
  readSession,revokeSession,validCsrf,validOrigin,parseAdminForm,
  setSessionCookie,clearSessionCookie
} from './auth.js';
import {page,loginPage,dashboardPage} from './ui.js';
import {validPositiveInt} from '../domain.js';
import {adminLanguage,normalizeLanguage} from '../i18n.js';
import {a} from './locales.js';
import {queryOptions,listProducts,listAdminOrders,adminSummary,recentAudit,inventoryExport} from './data.js';

const headers={'cache-control':'no-store, private','referrer-policy':'no-referrer'};
function redirect(location,extra={}) {
  return new Response(null,{status:303,headers:{...headers,location,...extra}});
}
function errorPage(message,status=400,lang='vi') {
  return page('<main class="shell"><h1>Yêu cầu không hợp lệ</h1><p>'+a(lang,message)+'</p>'
    +'<p><a href="/admin">Quay lại Dashboard</a></p></main>',{status,lang});
}
function validText(value,max) {
  const s=String(value??'').trim();
  return s && s.length<=max?s:null;
}
async function audit(env,action,target) {
  await env.DB.prepare('INSERT INTO admin_audit(action,target_id) VALUES(?,?)').bind(action,String(target)).run();
}
async function dashboardData(env,tab,opts) {
  const stats=await adminSummary(env);
  const products=tab==='products'?await listProducts(env,opts):null;
  const orders=(tab==='orders'||tab==='overview')
    ?await listAdminOrders(env,tab==='overview'?{q:'',kind:'',active:'',status:'',provider:'',page:1}:opts)
    :null;
  const banks=tab==='reviews'?(await env.DB.prepare(
    'SELECT event_id,order_id,amount_vnd,reason FROM bank_payment_reviews '
    + 'WHERE acknowledged_at IS NULL ORDER BY received_at ASC LIMIT 30'
  ).all()).results:[];
  const refunds=tab==='reviews'?(await env.DB.prepare(
    "SELECT order_id,state,requested_at FROM star_refunds WHERE state!='CONFIRMED' "
    + 'ORDER BY requested_at ASC LIMIT 30'
  ).all()).results:[];
  const audit=tab==='audit'?await recentAudit(env,50):[];
  return {stats,products,orders,banks,refunds,audit,filters:opts};
}

async function writeAction(env,path,form) {
  if(path==='/admin/products/create'||path==='/admin/products/update') {
    const kind=path.endsWith('/create')?String(form.get('kind')||''):null;
    const name=validText(form.get('name'),80);
    const description=String(form.get('description')||'').trim();
    const active=String(form.get('active'))==='0'?0:1;
    if(!name||description.length>240)throw new Error('Invalid product values');
    if(kind!==null && !['digital','physical'].includes(kind))throw new Error('Invalid product kind');
    let id=null,productKind=kind;
    if(path.endsWith('/update')) {
      id=validPositiveInt(form.get('id'));
      if(!id)throw new Error('Invalid product id');
      const p=await env.DB.prepare('SELECT id,kind FROM products WHERE id=?').bind(id).first();
      if(!p)throw new Error('Product not found');
      productKind=p.kind;
    }
    const price=validPositiveInt(form.get('price'),productKind==='digital'?100000:999999999);
    if(!price)throw new Error('Invalid price');
    if(id) {
      const r=await env.DB.prepare(
        'UPDATE products SET name=?,description=?,price_vnd=?,price_stars=?,active=? WHERE id=?'
      ).bind(name,description,productKind==='physical'?price:0,productKind==='digital'?price:0,active,id).run();
      if(!r.meta.changes)throw new Error('Product not changed');
      await audit(env,'PRODUCT_UPDATE',id);
    } else {
      const r=await env.DB.prepare(
        'INSERT INTO products(name,description,kind,price_vnd,price_stars) VALUES(?,?,?,?,?)'
      ).bind(name,description,kind,kind==='physical'?price:0,kind==='digital'?price:0).run();
      await audit(env,'PRODUCT_CREATE',r.meta.last_row_id);
    }
    return '/admin?tab=products&notice=saved';
  }
  if(path==='/admin/stock/bulk') {
    const id=validPositiveInt(form.get('product_id'));
    const raw=String(form.get('keys')||'');
    if(!id||raw.length>12000)throw new Error('Invalid bulk inventory payload');
    const entries=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!entries.length||entries.length>50||entries.some(x=>x.length>200))
      throw new Error('Bulk import accepts 1–50 keys of up to 200 characters each');
    if(new Set(entries).size!==entries.length)throw new Error('Duplicate key in submitted batch');
    const product=await env.DB.prepare(
      "SELECT id FROM products WHERE id=? AND kind='digital'"
    ).bind(id).first();
    if(!product)throw new Error('Product not digital');
    const operations=entries.map(key=>env.DB.prepare(
      'INSERT INTO digital_inventory(product_id,secret_value) '
      + 'SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM digital_inventory WHERE product_id=? AND secret_value=?)'
    ).bind(id,key,id,key));
    const applied=await env.DB.batch(operations);
    const added=applied.reduce((count,result)=>count+Number(result.meta?.changes||0),0);
    // Never echo, log or audit raw keys. Only counts and product IDs are retained.
    await audit(env,'STOCK_BULK_ADD',id+':'+added);
    return '/admin?tab=products&notice=imported';
  }
  if(path==='/admin/stock/add') {
    const id=validPositiveInt(form.get('product_id'));
    const key=validText(form.get('key'),2000);
    if(!id||!key)throw new Error('Invalid inventory');
    const p=await env.DB.prepare("SELECT id FROM products WHERE id=? AND kind='digital'").bind(id).first();
    if(!p)throw new Error('No digital product');
    await env.DB.prepare(
      'INSERT INTO digital_inventory(product_id,secret_value) '
      + 'SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM digital_inventory WHERE product_id=? AND secret_value=?)'
    ).bind(id,key,id,key).run();
    await audit(env,'STOCK_ADD',id); // Never log key values.
    return '/admin?tab=products&notice=saved';
  }
  if(path==='/admin/orders/fulfill') {
    const order=String(form.get('order_id')||'');
    if(!/^E[A-F0-9]{12}$/.test(order))throw new Error('Invalid order');
    const updated=await env.DB.prepare(
      "UPDATE orders SET status='FULFILLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind='physical' AND status='PAID'"
    ).bind(order).run();
    if(!updated.meta.changes)throw new Error('Not a paid physical order');
    await audit(env,'ORDER_FULFILL',order);
    return '/admin?tab=orders&notice=fulfilled';
  }
  if(path==='/admin/reviews/ack') {
    const id=String(form.get('event_id')||'');
    if(!/^\d{1,30}$/.test(id))throw new Error('Invalid event ID');
    const updated=await env.DB.prepare(
      'UPDATE bank_payment_reviews SET acknowledged_at=CURRENT_TIMESTAMP WHERE event_id=? AND acknowledged_at IS NULL'
    ).bind(id).run();
    if(!updated.meta.changes)throw new Error('Review not found');
    await audit(env,'BANK_REVIEW_ACK',id);
    return '/admin?tab=reviews&notice=reviewed';
  }
  throw new Error('Unknown action');
}

export async function handleAdminRequest(request,env) {
  const url=new URL(request.url),path=url.pathname;
  const lang=adminLanguage(request);
  const fail=(message,status)=>errorPage(message,status,lang);
  const persistLocale=response=>{
    if(normalizeLanguage(url.searchParams.get('lang'))) {
      response.headers.append('set-cookie','eplus_admin_lang='+lang
        +'; Path=/admin; Max-Age=31536000; Secure; SameSite=Strict');
    }
    return response;
  };
  if(!dashboardConfigured(env))return fail(
    'Dashboard chưa bật. Cấu hình ADMIN_DASHBOARD_PASSWORD tối thiểu 16 ký tự trong hosting secrets.',503
  );
  if(request.method!=='GET' && request.method!=='POST')return fail('Method not allowed',405);
  if(request.method==='POST') {
    if(!validOrigin(request))return fail('Origin verification failed',403);
    let form;
    try {form=await parseAdminForm(request);}catch{return fail('Form bị lỗi hoặc quá lớn',413);}
    if(path==='/admin/login') {
      if(await loginBlocked(env,request))return fail('Đăng nhập tạm khóa. Thử lại sau 15 phút.',429);
      if(!await passwordMatches(env,form.get('password'))) {
        await noteFailedLogin(env,request);
        return fail('Mật khẩu không hợp lệ',401);
      }
      const session=await createSession(env,request);
      return redirect('/admin?lang='+lang,{'set-cookie':setSessionCookie(session.token)});
    }
    const session=await readSession(env,request);
    if(!session)return fail('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',401);
    if(!validCsrf(session,form))return fail('CSRF verification failed',403);
    if(path==='/admin/logout') {
      await revokeSession(env,session);
      return redirect('/admin',{'set-cookie':clearSessionCookie()});
    }
    try{return redirect(await writeAction(env,path,form));}
    catch(error) {
      console.error('Admin mutation rejected:',path,error.message);
      return fail('Dữ liệu không hợp lệ hoặc thao tác không được phép',400);
    }
  }
  if(path==='/admin/export/inventory.csv') {
    const session=await readSession(env,request);
    if(!session)return fail('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',401);
    const rows=await inventoryExport(env);
    // Intentionally numeric aggregates and controlled enum only; never keys
    // or product/customer-provided strings (CSV formula injection risk).
    const csv='product_id,kind,total,available,reserved,delivered\r\n'
      + rows.map(row=>[
        Number(row.id),row.kind,
        Number(row.total||0),Number(row.available||0),
        Number(row.reserved||0),Number(row.delivered||0)
      ].join(',')).join('\r\n')+'\r\n';
    return new Response(csv,{headers:{
      'content-type':'text/csv; charset=utf-8',
      'cache-control':'no-store, private',
      'content-disposition':'attachment; filename="inventory-summary.csv"',
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer'
    }});
  }
  if(path!=='/admin'&&path!=='/admin/login')return fail('Not found',404);
  const session=await readSession(env,request);
  if(!session)return persistLocale(loginPage('',lang));
  if(path==='/admin/login')return redirect('/admin?lang='+lang);
  const requested=url.searchParams.get('tab')||'overview';
  const tab=['overview','products','orders','reviews','audit'].includes(requested)?requested:'overview';
  const notices={saved:'Đã lưu thay đổi.',imported:'Đã nhập các key mới hợp lệ; key trùng hiện có được bỏ qua.',fulfilled:'Đã đánh dấu đơn hoàn tất. Hãy xác nhận khách đã nhận hàng.',reviewed:'Đã ghi nhận đối soát; không tự hoàn tiền.'};
  const flash=a(lang,notices[url.searchParams.get('notice')]||'');
  return persistLocale(dashboardPage(await dashboardData(env,tab,queryOptions(url.searchParams)),session,tab,flash,lang));
}
