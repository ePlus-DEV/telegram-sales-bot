import {
  dashboardConfigured,passwordMatches,loginBlocked,noteFailedLogin,createSession,
  readSession,revokeSession,validCsrf,validOrigin,parseAdminForm,
  setSessionCookie,clearSessionCookie
} from './auth.js';
import {page,loginPage,dashboardPage} from './ui.js';
import {validPositiveInt} from '../domain.js';

const headers={'cache-control':'no-store, private','referrer-policy':'no-referrer'};
function redirect(location,extra={}) {
  return new Response(null,{status:303,headers:{...headers,location,...extra}});
}
function errorPage(message,status=400) {
  return page('<main class="shell"><h1>Yêu cầu không hợp lệ</h1><p>'+message+'</p>'
    +'<p><a href="/admin">Quay lại Dashboard</a></p></main>',{status});
}
function validText(value,max) {
  const s=String(value??'').trim();
  return s && s.length<=max?s:null;
}
async function audit(env,action,target) {
  await env.DB.prepare('INSERT INTO admin_audit(action,target_id) VALUES(?,?)').bind(action,String(target)).run();
}
async function count(env,sql) {
  return Number((await env.DB.prepare(sql).first())?.n||0);
}
async function dashboardData(env) {
  const stats={
    products:await count(env,"SELECT COUNT(*) AS n FROM products WHERE active=1"),
    pending:await count(env,"SELECT COUNT(*) AS n FROM orders WHERE status='PAID' AND kind='physical'"),
    keys:await count(env,"SELECT COUNT(*) AS n FROM digital_inventory WHERE reserved_order_id IS NULL AND delivered_order_id IS NULL"),
    reviews:await count(env,"SELECT COUNT(*) AS n FROM bank_payment_reviews WHERE acknowledged_at IS NULL")
  };
  const products=(await env.DB.prepare(
    'SELECT p.id,p.name,p.description,p.kind,p.price_vnd,p.price_stars,p.active,'
    + '(SELECT COUNT(*) FROM digital_inventory d WHERE d.product_id=p.id) AS total_keys,'
    + '(SELECT COUNT(*) FROM digital_inventory d WHERE d.product_id=p.id AND d.reserved_order_id IS NULL AND d.delivered_order_id IS NULL) AS ready_keys '
    + 'FROM products p ORDER BY p.id DESC LIMIT 50'
  ).all()).results;
  const orders=(await env.DB.prepare(
    'SELECT o.id,o.user_id,o.kind,o.total_vnd,o.total_stars,o.status,o.created_at,'
    + "CASE WHEN r.state='CONFIRMED' THEN 'REFUNDED' "
    + "WHEN r.state IS NOT NULL THEN 'REFUND_'||r.state "
    + "WHEN e.order_id IS NOT NULL AND o.status='PENDING' THEN 'EXPIRED' "
    + 'ELSE o.status END AS display_status '
    + 'FROM orders o LEFT JOIN order_expirations e ON e.order_id=o.id '
    + 'LEFT JOIN star_refunds r ON r.order_id=o.id ORDER BY o.created_at DESC LIMIT 50'
  ).all()).results;
  const banks=(await env.DB.prepare(
    'SELECT event_id,order_id,amount_vnd,reason FROM bank_payment_reviews '
    + 'WHERE acknowledged_at IS NULL ORDER BY received_at ASC LIMIT 30'
  ).all()).results;
  const refunds=(await env.DB.prepare(
    "SELECT order_id,state,requested_at FROM star_refunds WHERE state!='CONFIRMED' "
    + 'ORDER BY requested_at ASC LIMIT 30'
  ).all()).results;
  return {stats,products,orders,banks,refunds};
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
  if(path==='/admin/stock/add') {
    const id=validPositiveInt(form.get('product_id'));
    const key=validText(form.get('key'),2000);
    if(!id||!key)throw new Error('Invalid inventory');
    const p=await env.DB.prepare("SELECT id FROM products WHERE id=? AND kind='digital'").bind(id).first();
    if(!p)throw new Error('No digital product');
    await env.DB.prepare('INSERT INTO digital_inventory(product_id,secret_value) VALUES(?,?)').bind(id,key).run();
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
  const path=new URL(request.url).pathname;
  if(!dashboardConfigured(env))return errorPage(
    'Dashboard chưa bật. Cấu hình ADMIN_DASHBOARD_PASSWORD tối thiểu 16 ký tự trong hosting secrets.',503
  );
  if(request.method!=='GET' && request.method!=='POST')return errorPage('Method not allowed',405);
  if(request.method==='POST') {
    if(!validOrigin(request))return errorPage('Origin verification failed',403);
    let form;
    try {form=await parseAdminForm(request);}catch{return errorPage('Form bị lỗi hoặc quá lớn',413);}
    if(path==='/admin/login') {
      if(await loginBlocked(env,request))return errorPage('Đăng nhập tạm khóa. Thử lại sau 15 phút.',429);
      if(!await passwordMatches(env,form.get('password'))) {
        await noteFailedLogin(env,request);
        return errorPage('Mật khẩu không hợp lệ',401);
      }
      const session=await createSession(env,request);
      return redirect('/admin',{'set-cookie':setSessionCookie(session.token)});
    }
    const session=await readSession(env,request);
    if(!session)return errorPage('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',401);
    if(!validCsrf(session,form))return errorPage('CSRF verification failed',403);
    if(path==='/admin/logout') {
      await revokeSession(env,session);
      return redirect('/admin',{'set-cookie':clearSessionCookie()});
    }
    try{return redirect(await writeAction(env,path,form));}
    catch(error) {
      console.error('Admin mutation rejected:',path,error.message);
      return errorPage('Dữ liệu không hợp lệ hoặc thao tác không được phép',400);
    }
  }
  if(path!=='/admin'&&path!=='/admin/login')return errorPage('Not found',404);
  const session=await readSession(env,request);
  if(!session)return loginPage();
  if(path==='/admin/login')return redirect('/admin');
  const url=new URL(request.url);
  const requested=url.searchParams.get('tab')||'overview';
  const tab=['overview','products','orders','reviews'].includes(requested)?requested:'overview';
  const notices={saved:'Đã lưu thay đổi.',fulfilled:'Đã đánh dấu đơn hoàn tất. Hãy xác nhận khách đã nhận hàng.',reviewed:'Đã ghi nhận đối soát; không tự hoàn tiền.'};
  const flash=notices[url.searchParams.get('notice')]||'';
  return dashboardPage(await dashboardData(env),session,tab,flash);
}
