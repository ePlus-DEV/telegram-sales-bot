import { createOrderId, orderPaymentMatches, validPositiveInt, vietQrUrl } from './domain.js';

async function physicalReceipt(env, chatId, order, send) {
  const qr = vietQrUrl(env,order.id,order.total_vnd);
  return send(env,chatId,'Đơn ' + order.id + '\nSản phẩm: ' + order.name
    + '\nSố tiền: ' + order.total_vnd.toLocaleString('vi-VN') + 'đ'
    + '\nNgân hàng BIN: ' + env.BANK_BIN + '\nSTK: ' + env.BANK_ACCOUNT_NO
    + '\nNội dung bắt buộc: ' + order.id + '\nQR: ' + qr
    + '\nChỉ chuyển đúng số tiền/nội dung. Đơn được xử lý khi SePay xác nhận.');
}

async function invoiceReceipt(env, chatId, order, telegram, send) {
  if (order.status !== 'PENDING') {
    return send(env,chatId,'Đơn ' + order.id + ' đã được xử lý (' + order.status + '). Kiểm tra /orders hoặc /mykey ' + order.id);
  }
  let intent = await env.DB.prepare('SELECT invoice_url FROM purchase_intents WHERE order_id=? AND user_id=?')
    .bind(order.id,String(order.user_id)).first();
  if (!intent) return send(env,chatId,'Không tìm thấy hóa đơn. Liên hệ hỗ trợ.');
  let url = intent.invoice_url;
  if (!url) {
    // createInvoiceLink returns a URL, not a message. If Telegram responds but
    // this process crashes before saving, a retry may create another link,
    // but no link was sent to the user yet. A pre-checkout claim below ensures
    // only one payment attempt can be authorized for the same order.
    const response = await telegram(env,'createInvoiceLink',{
      title: order.name.slice(0,32),
      description: (order.description || order.name).slice(0,255),
      payload:order.id,
      currency:'XTR',
      prices:[{ label:order.name.slice(0,32),amount:order.total_stars }]
    });
    if (typeof response !== 'string' || !/^https:\/\/(?:t\.me|telegram\.me)\//.test(response))
      throw new Error('Telegram returned an invalid invoice URL');
    await env.DB.prepare('UPDATE purchase_intents SET invoice_url=? WHERE order_id=? AND invoice_url IS NULL')
      .bind(response,order.id).run();
    intent = await env.DB.prepare('SELECT invoice_url FROM purchase_intents WHERE order_id=?')
      .bind(order.id).first();
    url = intent?.invoice_url;
  }
  if (!url) throw new Error('Invoice link was not persisted');
  return send(env,chatId,'⭐ Đơn ' + order.id + '\n' + order.name + ' · '
    + order.total_stars + ' Stars\nNhấn nút bên dưới để thanh toán. Xem lại: /invoice ' + order.id,{
    reply_markup:{inline_keyboard:[[{text:'⭐ Thanh toán Stars',url}]]}
  });
}

async function presentOrder(env,chatId,orderId,telegram,send) {
  const order = await env.DB.prepare(
    'SELECT o.*,p.name,p.description FROM orders o JOIN products p ON o.product_id=p.id WHERE o.id=?'
  ).bind(orderId).first();
  if (!order) return send(env,chatId,'Đơn hàng không còn tồn tại. Liên hệ hỗ trợ.');
  if (order.kind === 'physical') return physicalReceipt(env,chatId,order,send);
  return invoiceReceipt(env,chatId,order,telegram,send);
}

export async function createPurchase(env,{callbackId,chatId,userId,productId},telegram,send) {
  const cb = String(callbackId || '');
  if (!cb || cb.length > 256 || !validPositiveInt(productId) || !validPositiveInt(userId,Number.MAX_SAFE_INTEGER))
    return send(env,chatId,'Yêu cầu đặt hàng không hợp lệ.');
  const first = await env.DB.prepare('SELECT * FROM purchase_intents WHERE callback_id=?').bind(cb).first();
  if (first) {
    if (first.user_id !== String(userId) || first.product_id !== productId || first.chat_id !== String(chatId))
      return send(env,chatId,'Yêu cầu đặt hàng không khớp.');
    return presentOrder(env,chatId,first.order_id,telegram,send);
  }
  const p = await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1').bind(productId).first();
  if (!p) return send(env,chatId,'Không tìm thấy sản phẩm.');
  const id = createOrderId();
  const physical = p.kind === 'physical';
  if (physical) {
    if (!env.SEPAY_WEBHOOK_API_KEY || !env.BANK_ACCOUNT_NO)
      return send(env,chatId,'Thanh toán ngân hàng chưa được cấu hình.');
    // Validate destination config *before* creating an immutable order.
    vietQrUrl(env,id,p.price_vnd);
  }
  // All statements in a D1/libSQL batch are atomic. A replay or concurrent
  // execution with the same callback id sees one committed purchase_intents row
  // and cannot create a second order. Stock is reserved in the same batch.
  const insertSql = 'INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd,total_stars) '
    + 'SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM purchase_intents WHERE callback_id=?) '
    + 'AND EXISTS(SELECT 1 FROM products WHERE id=? AND active=1) '
    + (physical ? '' :
      'AND EXISTS(SELECT 1 FROM digital_inventory WHERE product_id=? AND reserved_order_id IS NULL AND delivered_order_id IS NULL)');
  const args = [id,String(userId),p.id,p.kind,physical?'sepay':'stars',physical?p.price_vnd:0,
    physical?0:p.price_stars,cb,p.id,...(physical?[]:[p.id])];
  const steps = [
    env.DB.prepare(insertSql).bind(...args),
    env.DB.prepare(
      'INSERT OR IGNORE INTO purchase_intents(callback_id,order_id,user_id,chat_id,product_id) '
      + 'SELECT ?,id,?,?,? FROM orders WHERE id=?'
    ).bind(cb,String(userId),String(chatId),p.id,id)
  ];
  if (!physical) {
    steps.push(env.DB.prepare(
      'UPDATE digital_inventory SET reserved_order_id=? WHERE '
      + 'id=(SELECT id FROM digital_inventory WHERE product_id=? '
      + 'AND reserved_order_id IS NULL AND delivered_order_id IS NULL ORDER BY id LIMIT 1) '
      + 'AND reserved_order_id IS NULL '
      + 'AND EXISTS(SELECT 1 FROM purchase_intents WHERE order_id=?)'
    ).bind(id,p.id,id));
  }
  await env.DB.batch(steps);
  const actual = await env.DB.prepare('SELECT * FROM purchase_intents WHERE callback_id=?').bind(cb).first();
  if (!actual) return send(env,chatId,physical?'Sản phẩm không còn khả dụng.':'Sản phẩm đã hết hàng.');
  if (actual.user_id !== String(userId) || actual.product_id !== p.id || actual.chat_id !== String(chatId))
    return send(env,chatId,'Yêu cầu đặt hàng không khớp.');
  return presentOrder(env,chatId,actual.order_id,telegram,send);
}

export async function recoverInvoice(env,chatId,userId,orderId,telegram,send) {
  const id = String(orderId || '').trim();
  const intent = await env.DB.prepare(
    'SELECT pi.order_id FROM purchase_intents pi JOIN orders o ON o.id=pi.order_id '
      + "WHERE pi.order_id=? AND pi.user_id=? AND o.kind='digital'"
  ).bind(id,String(userId)).first();
  if (!intent) return send(env,chatId,'Không tìm thấy hóa đơn của bạn.');
  return presentOrder(env,chatId,intent.order_id,telegram,send);
}

export async function approvePrecheckout(env,query) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(query.invoice_payload).first();
  if (query.currency !== 'XTR' || !orderPaymentMatches(order,query.from.id,query.total_amount,'stars')) return false;
  // Atomic one-authorization-per-order guard, including across two concurrent
  // invoice links. Replays of the *same* pre_checkout_query id are allowed.
  const updated = await env.DB.prepare(
    'UPDATE purchase_intents SET checkout_query_id=? WHERE order_id=? '
    + 'AND (checkout_query_id IS NULL OR checkout_query_id=?) '
    + 'AND EXISTS(SELECT 1 FROM digital_inventory WHERE reserved_order_id=?) '
    + "AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='PENDING')"
  ).bind(String(query.id),order.id,String(query.id),order.id,order.id).run();
  return !!updated.meta.changes;
}
