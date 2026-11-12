// Read-only, server-side admin queries. Filters are allowlisted and all
// user input is SQL-bound; pagination is capped to avoid full-table rendering.
const PAGE_SIZE = 20;
const MAX_PAGE = 1000;
const ORDER_STATUSES = ['PENDING','PAID','FULFILLED','EXPIRED','REFUNDED','REFUND_CALLING','REFUND_NEEDS_REVIEW'];
const ORDER_PROVIDERS = ['stars','sepay'];
const KINDS = ['digital','physical'];

export function queryOptions(searchParams) {
  const raw = String(searchParams.get('q') || '').trim().slice(0,80);
  const kind = KINDS.includes(searchParams.get('kind')) ? searchParams.get('kind') : '';
  const active = ['1','0'].includes(searchParams.get('active')) ? searchParams.get('active') : '';
  const status = ORDER_STATUSES.includes(searchParams.get('status')) ? searchParams.get('status') : '';
  const provider = ORDER_PROVIDERS.includes(searchParams.get('provider')) ? searchParams.get('provider') : '';
  const page = /^[1-9]\d*$/.test(String(searchParams.get('page')||''))
    ? Math.min(Number(searchParams.get('page')),MAX_PAGE) : 1;
  return {q:raw,kind,active,status,provider,page};
}

async function resultSet(env,sql,values=[]) {
  return (await env.DB.prepare(sql).bind(...values).all()).results;
}
async function scalar(env,sql,values=[]) {
  return Number((await env.DB.prepare(sql).bind(...values).first())?.n||0);
}

function queryParts(type,opts) {
  const parts=[], args=[];
  if(type==='products') {
    if(opts.q) {
      parts.push('(instr(lower(p.name),lower(?))>0 OR CAST(p.id AS TEXT)=?)');
      args.push(opts.q,opts.q);
    }
    if(opts.kind){parts.push('p.kind=?');args.push(opts.kind);}
    if(opts.active!==''){parts.push('p.active=?');args.push(Number(opts.active));}
  } else {
    if(opts.q){
      parts.push('(instr(lower(o.id),lower(?))>0 OR instr(o.user_id,?)>0)');
      args.push(opts.q,opts.q);
    }
    if(opts.provider){parts.push('o.provider=?');args.push(opts.provider);}
    if(opts.status) {
      // Match the rendered status, including expired/refund sidecars.
      parts.push("CASE WHEN r.state='CONFIRMED' THEN 'REFUNDED' "
        + "WHEN r.state IS NOT NULL THEN 'REFUND_'||r.state "
        + "WHEN e.order_id IS NOT NULL AND o.status='PENDING' THEN 'EXPIRED' "
        + 'ELSE o.status END=?');
      args.push(opts.status);
    }
  }
  return {where:parts.length?' WHERE '+parts.join(' AND '):'',args};
}

export async function listProducts(env,opts) {
  const {where,args}=queryParts('products',opts);
  const total=await scalar(env,'SELECT COUNT(*) AS n FROM products p'+where,args);
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const page=Math.min(opts.page,pages,MAX_PAGE);
  const records=await resultSet(env,
    'SELECT p.id,p.name,p.description,p.kind,p.price_vnd,p.price_stars,p.active,'
    + '(SELECT COUNT(*) FROM digital_inventory d WHERE d.product_id=p.id) AS total_keys,'
    + '(SELECT COUNT(*) FROM digital_inventory d WHERE d.product_id=p.id AND d.reserved_order_id IS NULL AND d.delivered_order_id IS NULL) AS ready_keys '
    + 'FROM products p'+where+' ORDER BY p.id DESC LIMIT ? OFFSET ?',
    [...args,PAGE_SIZE,(page-1)*PAGE_SIZE]);
  return {records,total,page,pages};
}

const orderFrom = ' FROM orders o LEFT JOIN order_expirations e ON e.order_id=o.id '
  + 'LEFT JOIN star_refunds r ON r.order_id=o.id ';
export async function listAdminOrders(env,opts) {
  const {where,args}=queryParts('orders',opts);
  const total=await scalar(env,'SELECT COUNT(*) AS n'+orderFrom+where,args);
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const page=Math.min(opts.page,pages,MAX_PAGE);
  const records=await resultSet(env,
    'SELECT o.id,o.user_id,o.kind,o.provider,o.total_vnd,o.total_stars,o.status,o.created_at,'
    + "CASE WHEN r.state='CONFIRMED' THEN 'REFUNDED' "
    + "WHEN r.state IS NOT NULL THEN 'REFUND_'||r.state "
    + "WHEN e.order_id IS NOT NULL AND o.status='PENDING' THEN 'EXPIRED' "
    + 'ELSE o.status END AS display_status '
    +orderFrom+where+' ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?',
    [...args,PAGE_SIZE,(page-1)*PAGE_SIZE]);
  return {records,total,page,pages};
}

export async function adminSummary(env) {
  const rows = await resultSet(env,
    "SELECT o.provider,COUNT(*) AS n,SUM(o.total_vnd) AS vnd,SUM(o.total_stars) AS stars "
    + "FROM orders o LEFT JOIN star_refunds r ON r.order_id=o.id "
    + "WHERE o.status IN ('PAID','FULFILLED') AND o.payment_ref IS NOT NULL "
    + "AND (r.state IS NULL OR r.state!='CONFIRMED') GROUP BY o.provider");
  const totals={sepayVnd:0,stars:0,paidOrders:0};
  for(const row of rows) {
    totals.paidOrders+=Number(row.n||0);
    if(row.provider==='sepay')totals.sepayVnd=Number(row.vnd||0);
    if(row.provider==='stars')totals.stars=Number(row.stars||0);
  }
  const stats={
    products:await scalar(env,"SELECT COUNT(*) AS n FROM products WHERE active=1"),
    pending:await scalar(env,"SELECT COUNT(*) AS n FROM orders WHERE status='PAID' AND kind='physical'"),
    keys:await scalar(env,"SELECT COUNT(*) AS n FROM digital_inventory WHERE reserved_order_id IS NULL AND delivered_order_id IS NULL"),
    reviews:await scalar(env,"SELECT COUNT(*) AS n FROM bank_payment_reviews WHERE acknowledged_at IS NULL"),
    alerts:await scalar(env,"SELECT COUNT(*) AS n FROM notification_outbox WHERE state!='SENT'")
  };
  return {...stats,...totals};
}

export async function recentAudit(env,limit=40) {
  return resultSet(env,
    'SELECT id,action,target_id,created_at FROM admin_audit ORDER BY id DESC LIMIT ?',[
      Math.max(1,Math.min(limit,100))
    ]);
}

export async function inventoryExport(env) {
  return resultSet(env,
    'SELECT p.id,p.kind,'
    + 'COUNT(d.id) AS total,'
    + 'SUM(CASE WHEN d.id IS NOT NULL AND d.reserved_order_id IS NULL AND d.delivered_order_id IS NULL THEN 1 ELSE 0 END) AS available,'
    + 'SUM(CASE WHEN d.reserved_order_id IS NOT NULL THEN 1 ELSE 0 END) AS reserved,'
    + 'SUM(CASE WHEN d.delivered_order_id IS NOT NULL THEN 1 ELSE 0 END) AS delivered '
    + 'FROM products p LEFT JOIN digital_inventory d ON d.product_id=p.id '
    + "WHERE p.kind='digital' GROUP BY p.id,p.kind ORDER BY p.id ASC"
  );
}
