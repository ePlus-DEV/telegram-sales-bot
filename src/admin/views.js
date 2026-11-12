// Shared presentational widgets: all query parameters are escaped and SQL
// filter values come from src/admin/data.js allowlists.
const escaped=value=>String(value??'').replace(/[&<>"']|[^\x00-\x7F]/gu,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]||'&#x'+c.codePointAt(0).toString(16)+';');

function select(name,label,selected,options){
  return '<label>'+label+'<select name="'+name+'">'
    +options.map(([value,title])=>'<option value="'+escaped(value)+'"'
      +(value===selected?' selected':'')+'>'+title+'</option>').join('')
    +'</select></label>';
}

export function filterToolbar(tab,filters) {
  const q=escaped(filters.q);
  let body='<label>Tìm kiếm<input name="q" type="search" value="'+q+'" maxlength="80" '
    +'placeholder="'+(tab==='products'?'Tên hoặc mã sản phẩm':'Mã đơn hoặc Telegram ID')+'"></label>';
  if(tab==='products'){
    body+=select('kind','Loại',filters.kind,[
      ['','Tất cả'],['digital','Sản phẩm số'],['physical','Hàng vật lý']
    ]);
    body+=select('active','Hiển thị',filters.active,[
      ['','Tất cả'],['1','Đang bán'],['0','Đã ẩn']
    ]);
  }else{
    body+=select('provider','Thanh toán',filters.provider,[
      ['','Tất cả'],['stars','Telegram Stars'],['sepay','SePay']
    ]);
    body+=select('status','Trạng thái',filters.status,[
      ['','Tất cả'],['PENDING','Chờ thanh toán'],['PAID','Đã thanh toán'],
      ['FULFILLED','Hoàn tất'],['EXPIRED','Hết hạn'],['REFUNDED','Đã hoàn Stars'],
      ['REFUND_CALLING','Đang hoàn Stars'],['REFUND_NEEDS_REVIEW','Hoàn Stars cần đối soát']
    ]);
  }
  return '<form class="filters panel" method="get" action="/admin">'
    +'<input type="hidden" name="tab" value="'+tab+'">'+body
    +'<div class="actions"><button type="submit">Lọc</button>'
    +'<a class="button secondary" href="/admin?tab='+tab+'">Xóa lọc</a></div></form>';
}

function pageLink(tab,filters,page){
  const params=new URLSearchParams({tab,page:String(page)});
  if(filters.q)params.set('q',filters.q);
  if(tab==='products'){
    if(filters.kind)params.set('kind',filters.kind);
    if(filters.active!=='')params.set('active',filters.active);
  }else{
    if(filters.provider)params.set('provider',filters.provider);
    if(filters.status)params.set('status',filters.status);
  }
  return '/admin?'+escaped(params.toString());
}

export function pagination(tab,listing,filters) {
  if(!listing)return '';
  const start=listing.total?(listing.page-1)*20+1:0;
  const end=Math.min(listing.total,listing.page*20);
  return '<nav class="pager" aria-label="Phân trang"><span class="mini">'
    +'Hiển thị '+start+'–'+end+' / '+listing.total
    +' · Trang '+listing.page+'/'+listing.pages+'</span><div class="actions">'
    +(listing.page>1?'<a class="button secondary" href="'+pageLink(tab,filters,listing.page-1)+'">Trước</a>':'')
    +(listing.page<listing.pages?'<a class="button secondary" href="'+pageLink(tab,filters,listing.page+1)+'">Tiếp</a>':'')
    +'</div></nav>';
}

export function bulkImportForm(csrf) {
  return '<section class="panel"><div class="panelhead"><h2>Nhập key hàng loạt</h2>'
    +'<span class="mini">Tối đa 50 key / lần · Không hiển thị lại key</span></div>'
    +'<form method="post" action="/admin/stock/bulk" class="grid">'
    +'<input type="hidden" name="csrf" value="'+escaped(csrf)+'">'
    +'<label>ID sản phẩm số<input type="number" name="product_id" required min="1" max="999999999"></label>'
    +'<label class="full">Danh sách key (mỗi dòng một key)'
    +'<textarea name="keys" rows="6" maxlength="12000" required autocomplete="off" '
    +'placeholder="KEY-001&#10;KEY-002"></textarea></label>'
    +'<div class="full"><button type="submit">Nhập key</button>'
    +'<p class="help">Mỗi dòng tối đa 200 ký tự; key trùng trong yêu cầu bị từ chối, key đã có trong kho được bỏ qua. '
    +'Không đưa dữ liệu tài khoản nhạy cảm hoặc không được phép phân phối vào kho.</p></div>'
    +'</form></section>';
}

export function auditView(rows) {
  return '<section class="panel"><div class="panelhead"><h2>Nhật ký thao tác</h2>'
    +'<span class="mini">50 hoạt động gần nhất · Không chứa giá trị key</span></div>'
    +'<div class="tablewrap"><table><thead><tr><th>ID</th><th>Hoạt động</th>'
    +'<th>Đối tượng</th><th>Thời gian</th></tr></thead><tbody>'
    +(rows.map(r=>'<tr><td>'+Number(r.id)+'</td><td><code>'+escaped(r.action)+'</code></td>'
      +'<td>'+escaped(r.target_id)+'</td><td>'+escaped(r.created_at)+'</td></tr>').join('')
      ||'<tr><td colspan="4" class="muted">Chưa có hoạt động</td></tr>')
    +'</tbody></table></div></section>';
}
