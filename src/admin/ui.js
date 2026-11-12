// Intentionally no browser JavaScript: all mutations use server-side POST,
// CSRF tokens, strict Content Security Policy and HTML escaping.
export function html(value) {
  return String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
const styles = `
:root{color-scheme:light dark;--bg:#f4f6fb;--surface:#fff;--text:#17212f;--muted:#667085;--border:#e4e7ec;--primary:#2563eb;--dark:#142032;--positive:#067647;--warn:#b45309;--shadow:0 10px 30px rgba(15,23,42,.05)}
@media(prefers-color-scheme:dark){:root{--bg:#0b1220;--surface:#111e30;--text:#edf2fa;--muted:#a8b4c8;--border:#2a3850;--primary:#82aaff;--dark:#07101e;--positive:#73d5a7;--warn:#f0bf71;--shadow:none}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,Arial,sans-serif}h1,h2,h3,p{margin:0}a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
.shell{max-width:1240px;padding:26px 22px 60px;margin:auto}.top{display:flex;gap:16px;justify-content:space-between;align-items:center;margin-bottom:28px}.brand{display:flex;gap:12px;align-items:center}.logo{height:42px;width:42px;border-radius:14px;display:grid;place-items:center;background:var(--primary);color:#fff;font-weight:800;font-size:20px;box-shadow:var(--shadow)}.eyebrow{letter-spacing:.11em;text-transform:uppercase;color:var(--muted);font-weight:700;font-size:10px}.heading{font-size:23px;font-weight:750;letter-spacing:-.03em}.subtitle{color:var(--muted);font-size:13px}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 26px}nav a{padding:9px 16px;border-radius:10px;color:var(--muted);font-weight:650;border:1px solid transparent}nav a[aria-current=page]{background:var(--surface);border-color:var(--border);color:var(--text);box-shadow:var(--shadow)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:16px 0 24px}.stat,.panel{border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}.stat{padding:18px}.number{font-size:29px;font-weight:800;letter-spacing:-.04em;margin-top:6px}.panel{padding:22px;margin:15px 0}.panelhead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:18px}.panel h2{font-size:17px;letter-spacing:-.015em}.mini{color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:650}input,select,textarea{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 12px;width:100%;font:inherit;min-width:0}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--primary);outline-offset:2px}button,.button{background:var(--primary);border:0;border-radius:10px;padding:10px 16px;color:#fff;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}.secondary{background:transparent;color:var(--text);border:1px solid var(--border)}.danger{color:#d55059}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.full{grid-column:1/-1}.help{font-size:12px;color:var(--muted);margin-top:8px}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:580px;text-align:left}th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--border)}td{padding:12px;border-bottom:1px solid var(--border);vertical-align:middle}td code{font-size:12px}tbody tr:last-child td{border-bottom:0}.pill{display:inline-block;border-radius:99px;padding:3px 9px;background:var(--bg);border:1px solid var(--border);font-size:11px;font-weight:700}.good{color:var(--positive)}.warning{color:var(--warn)}.muted{color:var(--muted)}.flash{padding:12px 15px;margin:0 0 18px;border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:10px;background:var(--surface)}.login{max-width:400px;margin:10vh auto}.login .panel{padding:30px}.login h1{margin:12px 0}.login form{display:grid;gap:16px}.footer{margin-top:24px;color:var(--muted);font-size:12px}.tablinks{display:flex;align-items:center;gap:10px}.rowform{display:flex;gap:6px;align-items:center}.rowform input{max-width:100px}
@media(max-width:850px){.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:570px){.shell{padding:18px 13px 48px}.top{align-items:flex-start}.heading{font-size:19px}.panel{padding:16px}.stats{gap:8px}.stat{padding:14px}.number{font-size:24px}.grid,.grid.two{grid-template-columns:1fr}.tablewrap{margin:0 -5px}.login{margin:5vh auto}}
`;
const headers = {
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, private',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-frame-options':'DENY',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'permissions-policy':'camera=(), microphone=(), geolocation=()'
};
export function page(body,{status=200,extraHeaders={}}={}) {
  return new Response('<!doctype html><html lang="vi"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
    + '<title>ePlus Sales · Admin</title><style>'+styles+'</style></head><body>'+body+'</body></html>',
    {status,headers:{...headers,...extraHeaders}});
}
function hidden(csrf){return '<input type="hidden" name="csrf" value="'+html(csrf)+'">';}
function input(label,name,value='',type='text',extra=''){
  return '<label>'+html(label)+'<input name="'+html(name)+'" type="'+html(type)+'" value="'+html(value)+'" '+extra+'></label>';
}
const money=n=>Number(n||0).toLocaleString('vi-VN');
const statusText={PENDING:'Chờ thanh toán',PAID:'Đã thanh toán',FULFILLED:'Hoàn tất',EXPIRED:'Hết hạn'};
const kindText={digital:'Sản phẩm số',physical:'Hàng vật lý'};
function statusPill(status){return '<span class="pill '+(status==='FULFILLED'?'good':status==='PAID'?'warning':'')+'">'+html(statusText[status]||status)+'</span>';}
function layout(title,body){
  return '<div class="shell"><header class="top"><div class="brand"><div class="logo">e+</div><div>'
    + '<div class="eyebrow">ePlus.DEV / Commerce</div><div class="heading">'+html(title)+'</div>'
    + '<div class="subtitle">Telegram Sales Bot · Self-hosted</div></div></div>'
    + '<form action="/admin/logout" method="post" id="logout-form"></form></header>'+body
    + '<footer class="footer">Bảng quản trị dành riêng cho chủ cửa hàng. Không lưu token hoặc mật khẩu trong giao diện.</footer></div>';
}
export function loginPage(error=''){
  return page('<main class="login"><div class="brand"><div class="logo">e+</div><div><div class="eyebrow">ePlus.DEV</div><div class="heading">Sales Admin</div></div></div>'
  + '<section class="panel"><h1>Đăng nhập quản trị</h1><p class="subtitle">Sử dụng mật khẩu quản trị được cấu hình trên hosting.</p>'
  + (error?'<p class="flash" role="alert">'+html(error)+'</p>':'')
  + '<form action="/admin/login" method="post"><label>Mật khẩu quản trị'
  + '<input type="password" name="password" autocomplete="current-password" required minlength="16" maxlength="1024"></label>'
  + '<button type="submit">Đăng nhập</button></form></section>'
  + '<p class="footer">Kết nối được bảo vệ bằng HTTPS và phiên đăng nhập HttpOnly.</p></main>');
}
function tab(id,label,current){return '<a href="/admin?tab='+id+'" '+(id===current?'aria-current="page"':'')+'>'+label+'</a>';}
function stockForm(product,csrf){
  return '<form class="rowform" method="post" action="/admin/stock/add">'+hidden(csrf)
    + '<input type="hidden" name="product_id" value="'+product.id+'">'
    + '<input aria-label="Key mới cho '+html(product.name)+'" required name="key" placeholder="Key mới" maxlength="2000" autocomplete="off">'
    + '<button class="secondary" type="submit">Nhập</button></form>';
}
function renderProducts(products,csrf){
  const rows=products.map(p=>{
    const total=Number(p.total_keys||0),ready=Number(p.ready_keys||0);
    const price=p.kind==='digital'?p.price_stars:p.price_vnd;
    return '<tr><td><strong>#'+p.id+' · '+html(p.name)+'</strong><div class="mini">'+html(p.description)+'</div></td>'
      +'<td>'+html(kindText[p.kind]||p.kind)+'</td><td>'+money(price)+(p.kind==='digital'?' ⭐':' đ')+'</td>'
      +'<td>'+(p.kind==='digital'?ready+' sẵn / '+total+' tổng':'—')+'</td>'
      +'<td><span class="pill '+(p.active?'good':'')+'">'+(p.active?'Đang bán':'Đã ẩn')+'</span></td>'
      +'</tr>';
  }).join('');
  const edit=products.map(p=>'<details class="panel"><summary><strong>#'+p.id+' · '+html(p.name)+'</strong> · Sửa sản phẩm</summary>'
    +'<form action="/admin/products/update" method="post" class="grid" style="margin-top:14px">'+hidden(csrf)
    +'<input type="hidden" name="id" value="'+p.id+'">'
    +input('Tên sản phẩm','name',p.name,'text','required maxlength="80"')
    +input('Giá ('+(p.kind==='digital'?'Stars':'VND')+')','price',p.kind==='digital'?p.price_stars:p.price_vnd,'number','required min="1"')
    +'<label>Trạng thái<select name="active"><option value="1" '+(p.active?'selected':'')+'>Đang bán</option>'
    +'<option value="0" '+(!p.active?'selected':'')+'>Ẩn khỏi catalog</option></select></label>'
    +'<label class="full">Mô tả<textarea name="description" rows="2" maxlength="240">'+html(p.description)+'</textarea></label>'
    +'<div class="actions"><button>Lưu thay đổi</button></div></form>'
    +(p.kind==='digital'?'<div style="margin-top:14px">'+stockForm(p,csrf)+'</div>':'')+'</details>').join('');
  return '<section class="panel"><div class="panelhead"><h2>Thêm sản phẩm</h2><span class="mini">Phân tách hàng vật lý / sản phẩm số</span></div>'
    +'<form method="post" action="/admin/products/create" class="grid">'+hidden(csrf)
    +input('Tên sản phẩm','name','','text','required maxlength="80"')
    +'<label>Loại<select name="kind"><option value="physical">Hàng vật lý · VND</option><option value="digital">Sản phẩm số · Stars</option></select></label>'
    +input('Giá (VND hoặc Stars theo loại)','price','','number','required min="1" max="999999999"')
    +'<label class="full">Mô tả<textarea name="description" rows="2" maxlength="240" placeholder="Mô tả hiển thị cho khách"></textarea></label>'
    +'<div><button>Tạo sản phẩm</button></div></form></section>'
    +'<section class="panel"><div class="panelhead"><h2>Sản phẩm & kho</h2><span class="mini">Hiển thị tối đa 50 mục</span></div>'
    +'<div class="tablewrap"><table><thead><tr><th>Sản phẩm</th><th>Loại</th><th>Giá</th><th>Kho</th><th>Trạng thái</th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="5" class="muted">Chưa có sản phẩm</td></tr>')+'</tbody></table></div></section>'
    +'<section><h2 style="margin:22px 0">Chỉnh sửa & nhập key</h2>'+edit
    +'<p class="help">Mã key không được hiện lại trên dashboard sau khi nhập. Tránh nhập tài khoản hoặc thông tin không được phép phân phối.</p></section>';
}
function renderOrders(orders,csrf){
  return '<section class="panel"><div class="panelhead"><h2>Đơn hàng gần đây</h2><span class="mini">Tối đa 50 đơn · Không hiển thị nội dung key</span></div>'
    +'<div class="tablewrap"><table><thead><tr><th>Đơn</th><th>Khách Telegram</th><th>Loại</th><th>Số tiền</th><th>Trạng thái / thao tác</th></tr></thead><tbody>'
    +(orders.map(o=>'<tr><td><code>'+html(o.id)+'</code><div class="mini">'+html(o.created_at)+'</div></td>'
      +'<td><code>'+html(o.user_id)+'</code></td><td>'+html(kindText[o.kind])+'</td>'
      +'<td>'+money(o.kind==='digital'?o.total_stars:o.total_vnd)+(o.kind==='digital'?' ⭐':' đ')+'</td>'
      +'<td>'+statusPill(o.display_status)
      +(o.kind==='physical'&&o.status==='PAID'
        ?'<form method="post" action="/admin/orders/fulfill" class="actions" style="margin-top:9px">'+hidden(csrf)
        +'<input type="hidden" name="order_id" value="'+html(o.id)+'">'
        +'<button type="submit" class="secondary">Đánh dấu đã giao</button></form>':'')+'</td></tr>').join('')
      ||'<tr><td colspan="5" class="muted">Chưa có đơn hàng</td></tr>')
    +'</tbody></table></div><p class="help">Đánh dấu đã giao chỉ cập nhật đơn; liên hệ khách để xác nhận việc giao hàng thực tế.</p></section>';
}
function renderReviews(banks,refunds,csrf){
  return '<section class="panel"><div class="panelhead"><h2>Giao dịch ngân hàng cần đối soát</h2><span class="mini">Không tự hoàn hoặc ghi có tiền</span></div>'
    +'<div class="tablewrap"><table><thead><tr><th>SePay ID</th><th>Đơn</th><th>VND</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>'
    +(banks.map(x=>'<tr><td>'+html(x.event_id)+'</td><td><code>'+html(x.order_id)+'</code></td><td>'+money(x.amount_vnd)+'</td>'
    +'<td>'+html(x.reason)+'</td><td><form method="post" action="/admin/reviews/ack" class="actions">'
    +hidden(csrf)+'<input type="hidden" name="event_id" value="'+html(x.event_id)+'"><button class="secondary">Đã đối soát</button></form></td></tr>').join('')
      ||'<tr><td colspan="5" class="muted">Không có khoản chuyển cần đối soát</td></tr>')
    +'</tbody></table></div></section>'
    +'<section class="panel"><div class="panelhead"><h2>Hoàn Stars cần kiểm tra</h2><span class="mini">Chỉ xem · Không gọi lại hoàn tiền</span></div>'
    +'<div class="tablewrap"><table><thead><tr><th>Đơn</th><th>Trạng thái hoàn</th><th>Ngày yêu cầu</th></tr></thead><tbody>'
    +(refunds.map(x=>'<tr><td><code>'+html(x.order_id)+'</code></td><td>'+statusPill(x.state)+'</td><td>'+html(x.requested_at)+'</td></tr>').join('')
      ||'<tr><td colspan="3" class="muted">Không có yêu cầu cần xác minh</td></tr>')
    +'</tbody></table></div></section>';
}
export function dashboardPage(data,session,tab='overview',flash='') {
  const stats='<div class="stats">'
    +[['Sản phẩm',data.stats.products],['Đơn cần xử lý',data.stats.pending],['Key sẵn',data.stats.keys],['Đối soát',data.stats.reviews]]
      .map(([label,value])=>'<div class="stat"><div class="mini">'+label+'</div><div class="number">'+money(value)+'</div></div>').join('')
    +'</div>';
  const navigation='<nav aria-label="Điều hướng quản trị">'
    +tab('overview','Tổng quan',tab)+tab('products','Sản phẩm & Kho',tab)
    +tab('orders','Đơn hàng',tab)+tab('reviews','Đối soát',tab)+'</nav>';
  const info='<section class="panel"><h2>Tình trạng cửa hàng</h2><p class="help">Các khoản tiền vẫn phải được xác minh qua webhook và ledger. '
    +'Không thể hoàn tiền hoặc sửa số dư bằng thao tác dashboard. Quản trị viên cần xử lý các ca ngoại lệ ở mục Đối soát.</p></section>';
  const section=tab==='products'?renderProducts(data.products,session.csrf_token)
    :tab==='orders'?renderOrders(data.orders,session.csrf_token)
    :tab==='reviews'?renderReviews(data.banks,data.refunds,session.csrf_token)
    :info+renderOrders(data.orders.slice(0,10),session.csrf_token);
  const logout='<form method="post" action="/admin/logout" class="actions" style="margin-top:18px">'
    +hidden(session.csrf_token)+'<button type="submit" class="secondary">Đăng xuất phiên này</button></form>';
  return page(layout('Bảng điều khiển',navigation+stats
    +(flash?'<div class="flash" role="status">'+html(flash)+'</div>':'')+section+logout));
}
