import { constantTimeEqual, createOrderId, validPositiveInt, sepayPayment, vietQrUrl, orderPaymentMatches } from './domain.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function telegram(env, method, params) {
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN is not configured');
  const result = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params)
  });
  const payload = await result.json();
  if (!result.ok || !payload.ok) throw new Error('Telegram API error in ' + method);
  return payload.result;
}

const send = (env, chatId, text, extra = {}) => telegram(env, 'sendMessage', { chat_id: chatId, text, ...extra });
const adminId = env => String(env.ADMIN_TELEGRAM_ID || '');
const isAdmin = (env, id) => !!adminId(env) && String(id) === adminId(env);

async function catalog(env, chatId) {
  const rows = await env.DB.prepare('SELECT id,name,description,kind,price_vnd,price_stars FROM products WHERE active=1 ORDER BY id DESC LIMIT 30').all();
  if (!rows.results.length) return send(env, chatId, 'Chưa có sản phẩm. Vui lòng quay lại sau.');
  await send(env, chatId, '🛍 Danh sách sản phẩm (tối đa 30 mục):');
  for (const p of rows.results) {
    const price = p.kind === 'digital' ? p.price_stars + ' ⭐' : p.price_vnd.toLocaleString('vi-VN') + 'đ';
    await send(env, chatId, '#' + p.id + ' · ' + p.name + '\n' + p.description + '\n' + price, {
      reply_markup: { inline_keyboard: [[{ text: '🛒 Mua', callback_data: 'buy:' + p.id }]] }
    });
  }
}

async function listOrders(env, chatId, userId, admin = false) {
  const stmt = admin
    ? env.DB.prepare('SELECT id,user_id,kind,status,total_vnd,total_stars FROM orders ORDER BY created_at DESC LIMIT 10')
    : env.DB.prepare('SELECT id,user_id,kind,status,total_vnd,total_stars FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 10').bind(String(userId));
  const rows = await stmt.all();
  return send(env, chatId, rows.results.length
    ? rows.results.map(o => o.id + ' · ' + o.status + ' · ' + (o.kind === 'digital' ? o.total_stars + '⭐' : o.total_vnd + 'đ') + (admin ? ' · ' + o.user_id : '')).join('\n')
    : 'Chưa có đơn hàng.');
}

async function createPurchase(env, chatId, userId, productId) {
  const p = await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1').bind(productId).first();
  if (!p) return send(env, chatId, 'Không tìm thấy sản phẩm.');
  const id = createOrderId();
  if (p.kind === 'physical') {
    if (!env.SEPAY_WEBHOOK_API_KEY || !env.BANK_ACCOUNT_NO) return send(env, chatId, 'Thanh toán ngân hàng chưa được cấu hình.');
    await env.DB.prepare('INSERT INTO orders(id,user_id,product_id,kind,provider,total_vnd) VALUES(?,?,?,?,?,?)')
      .bind(id, String(userId), p.id, 'physical', 'sepay', p.price_vnd).run();
    const qr = vietQrUrl(env, id, p.price_vnd);
    return send(env, chatId, 'Đơn ' + id + '\nSản phẩm: ' + p.name + '\nSố tiền: ' + p.price_vnd.toLocaleString('vi-VN') + 'đ'
      + '\nNgân hàng BIN: ' + env.BANK_BIN + '\nSTK: ' + env.BANK_ACCOUNT_NO
      + '\nNội dung bắt buộc: ' + id + '\nQR: ' + qr
      + '\nChỉ chuyển khoản đúng số tiền và nội dung. Đơn được xử lý sau khi SePay xác nhận.');
  }
  // Reserve one item before issuing the Stars invoice, avoiding overselling inventory.
  await env.DB.prepare('INSERT INTO orders(id,user_id,product_id,kind,provider,total_stars) VALUES(?,?,?,?,?,?)')
    .bind(id, String(userId), p.id, 'digital', 'stars', p.price_stars).run();
  const reservation = await env.DB.prepare(
    'UPDATE digital_inventory SET reserved_order_id=? WHERE id=(SELECT id FROM digital_inventory WHERE product_id=? AND reserved_order_id IS NULL AND delivered_order_id IS NULL ORDER BY id LIMIT 1) AND reserved_order_id IS NULL'
  ).bind(id, p.id).run();
  if (!reservation.meta.changes) {
    await env.DB.prepare('DELETE FROM orders WHERE id=? AND status=\'PENDING\'').bind(id).run();
    return send(env, chatId, 'Sản phẩm đã hết hàng. Vui lòng thử lại sau.');
  }
  try {
    return await telegram(env, 'sendInvoice', {
      chat_id: chatId, title: p.name.slice(0, 32),
      description: (p.description || p.name).slice(0, 255),
      payload: id, provider_token: '', currency: 'XTR',
      prices: [{ label: p.name.slice(0, 32), amount: p.price_stars }]
    });
  } catch (err) {
    await env.DB.prepare('UPDATE digital_inventory SET reserved_order_id=NULL WHERE reserved_order_id=? AND delivered_order_id IS NULL').bind(id).run();
    await env.DB.prepare('DELETE FROM orders WHERE id=? AND status=\'PENDING\'').bind(id).run();
    throw err;
  }
}

async function finishStars(env, message) {
  const payment = message.successful_payment;
  const id = String(payment.invoice_payload || '');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!order || !['PENDING','PAID','FULFILLED'].includes(order.status)) return;
  const charge = String(payment.telegram_payment_charge_id || '');
  if (!charge || payment.currency !== 'XTR' || String(order.user_id) !== String(message.from.id) ||
      order.kind !== 'digital' || order.provider !== 'stars' || order.total_stars !== payment.total_amount) return;
  const results = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO payment_events(provider,event_id,order_id) VALUES(?,?,?)').bind('stars',charge,id),
    env.DB.prepare("UPDATE orders SET status='PAID',payment_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM payment_events WHERE provider='stars' AND event_id=? AND order_id=?)").bind(charge,id,charge,id)
  ]);
  const isThisCharge = await env.DB.prepare('SELECT 1 FROM payment_events WHERE provider=? AND event_id=? AND order_id=?').bind('stars',charge,id).first();
  if (!isThisCharge) return;
  await env.DB.prepare('UPDATE digital_inventory SET delivered_order_id=?,reserved_order_id=NULL WHERE reserved_order_id=? AND delivered_order_id IS NULL').bind(id,id).run();
  await env.DB.prepare("UPDATE orders SET status='FULFILLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID' AND EXISTS(SELECT 1 FROM digital_inventory WHERE delivered_order_id=?)").bind(id,id).run();
  const item = await env.DB.prepare('SELECT secret_value FROM digital_inventory WHERE delivered_order_id=?').bind(id).first();
  if (item) await send(env, message.chat.id, '✅ Đã thanh toán và giao hàng.\nĐơn: ' + id + '\nMã/Tài khoản:\n' + item.secret_value + '\nXem lại: /mykey ' + id);
  else {
    await send(env, message.chat.id, '✅ Thanh toán thành công. Đơn ' + id + ' cần hỗ trợ giao hàng. Dùng /paysupport.');
    if (adminId(env)) await send(env, adminId(env), '⚠️ Đơn Stars ' + id + ' đã trả tiền nhưng chưa giao được.');
  }
}

async function adminCommand(env, chatId, text) {
  if (text.startsWith('/addphysical ') || text.startsWith('/adddigital ')) {
    const physical = text.startsWith('/addphysical ');
    const fields = text.slice(physical ? 13 : 12).split('|').map(v => v.trim());
    const amount = validPositiveInt(fields[1], physical ? 999999999 : 100000);
    if (fields.length !== 3 || !fields[0] || fields[0].length > 80 || !amount || fields[2].length > 240) {
      return send(env, chatId, 'Cú pháp: /addphysical Tên | Giá VND | Mô tả\nhoặc /adddigital Tên | Giá Stars | Mô tả');
    }
    const result = await env.DB.prepare('INSERT INTO products(name,description,kind,price_vnd,price_stars) VALUES(?,?,?,?,?)')
      .bind(fields[0], fields[2], physical ? 'physical' : 'digital', physical ? amount : 0, physical ? 0 : amount).run();
    return send(env, chatId, 'Đã tạo sản phẩm #' + result.meta.last_row_id + (physical ? ' (hàng vật lý)' : ' (sản phẩm số - Stars)'));
  }
  if (text.startsWith('/addkey ')) {
    const match = text.match(/^\/addkey\s+(\d+)\s*\|\s*([\s\S]+)$/);
    if (!match || match[2].length > 2000) return send(env, chatId, 'Cú pháp: /addkey ID | Giá trị key/tài khoản');
    const p = await env.DB.prepare("SELECT id FROM products WHERE id=? AND kind='digital'").bind(Number(match[1])).first();
    if (!p) return send(env, chatId, 'Sản phẩm số không tồn tại.');
    await env.DB.prepare('INSERT INTO digital_inventory(product_id,secret_value) VALUES(?,?)').bind(p.id,match[2].trim()).run();
    return send(env, chatId, 'Đã bổ sung 1 key cho sản phẩm #' + p.id);
  }
  if (text === '/admin') return send(env, chatId, 'Quản trị:\n/addphysical Tên | VND | Mô tả\n/adddigital Tên | Stars | Mô tả\n/addkey ID | Key\n/adminorders\n/fulfill MÃ_ĐƠN');
  if (text === '/adminorders') return listOrders(env, chatId, null, true);
  if (text.startsWith('/fulfill ')) {
    const id = text.slice(9).trim();
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND kind='physical' AND status='PAID'").bind(id).first();
    if (!order) return send(env, chatId, 'Không có đơn vật lý đã thanh toán đang chờ xử lý.');
    const r = await env.DB.prepare("UPDATE orders SET status='FULFILLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID'").bind(id).run();
    if (r.meta.changes) {
      await send(env, order.user_id, '✅ Đơn ' + id + ' đã được admin đánh dấu hoàn tất.');
      return send(env, chatId, 'Đã hoàn tất ' + id);
    }
  }
  return send(env, chatId, 'Lệnh quản trị chưa hợp lệ. Dùng /admin.');
}

async function telegramUpdate(env, update) {
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(q.invoice_payload).first();
    const ok = q.currency === 'XTR' && orderPaymentMatches(order, q.from.id, q.total_amount, 'stars');
    return telegram(env, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: q.id, ok,
      ...(!ok ? { error_message: 'Đơn không hợp lệ hoặc đã được thanh toán. Vui lòng đặt lại.' } : {})
    });
  }
  const message = update.message;
  if (message?.successful_payment) return finishStars(env, message);
  const callback = update.callback_query;
  if (callback) {
    await telegram(env, 'answerCallbackQuery', { callback_query_id: callback.id });
    const match = String(callback.data || '').match(/^buy:(\d+)$/);
    if (match && callback.message?.chat?.id) return createPurchase(env, callback.message.chat.id, callback.from.id, Number(match[1]));
    return;
  }
  if (!message || message.chat?.type !== 'private') return;
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = String(message.text || '').trim();
  if (text === '/start') return send(env, chatId, '👋 Chào mừng đến ePlus Telegram Sales Bot!\n/catalog — Sản phẩm\n/orders — Đơn hàng\n/help — Trợ giúp');
  if (text === '/help') return send(env, chatId, 'Lệnh: /catalog, /orders, /mykey MÃ_ĐƠN, /paysupport.\nSản phẩm số thanh toán bằng Telegram Stars. Hàng vật lý dùng QR ngân hàng và SePay.');
  if (text === '/catalog' || text === '/products') return catalog(env, chatId);
  if (text === '/orders') return listOrders(env, chatId, userId);
  if (text.startsWith('/mykey ')) {
    const id = text.slice(7).trim();
    const item = await env.DB.prepare("SELECT i.secret_value FROM orders o JOIN digital_inventory i ON i.delivered_order_id=o.id WHERE o.id=? AND o.user_id=? AND o.status='FULFILLED'").bind(id,String(userId)).first();
    return send(env, chatId, item ? '🔑 Key của đơn ' + id + ':\n' + item.secret_value : 'Không tìm thấy key được phép truy cập.');
  }
  if (text === '/paysupport') return send(env, chatId, 'Hỗ trợ thanh toán: ' + (env.SUPPORT_USERNAME ? '@' + env.SUPPORT_USERNAME.replace(/^@/, '') : 'Liên hệ admin cửa hàng.'));
  if (isAdmin(env,userId) && text.startsWith('/')) return adminCommand(env,chatId,text);
  return send(env, chatId, 'Dùng /catalog để xem sản phẩm hoặc /help để được hỗ trợ.');
}

async function sepayWebhook(env, body, ctx) {
  const tx = sepayPayment(body, env.BANK_ACCOUNT_NO);
  if (!tx) return json({ success: true, matched: false });
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND kind='physical' AND provider='sepay' AND status='PENDING' AND total_vnd=?").bind(tx.orderId,tx.amount).first();
  if (!order) return json({ success: true, matched: false });
  const batch = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO payment_events(provider,event_id,order_id) SELECT 'sepay',?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='PENDING' AND total_vnd=?)")
      .bind(tx.eventId,tx.orderId,tx.orderId,tx.amount),
    env.DB.prepare("UPDATE orders SET status='PAID',payment_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING' AND provider='sepay' AND total_vnd=? AND EXISTS (SELECT 1 FROM payment_events WHERE provider='sepay' AND event_id=? AND order_id=?)")
      .bind(tx.eventId,tx.orderId,tx.amount,tx.eventId,tx.orderId)
  ]);
  if (batch[1].meta.changes) {
    ctx.waitUntil((async () => {
      await send(env, order.user_id, '✅ Đã nhận ' + tx.amount.toLocaleString('vi-VN') + 'đ cho đơn ' + tx.orderId + '. Đơn đang chờ giao hàng.');
      if (adminId(env)) await send(env,adminId(env),'📦 Đơn vật lý đã thanh toán: ' + tx.orderId + '\nDùng /fulfill ' + tx.orderId + ' sau khi giao.');
    })().catch(err => console.error('Payment notification failed:', err.message)));
  }
  return json({ success: true, matched: !!batch[1].meta.changes });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/healthz') return json({ ok: true, service: 'telegram-sales-bot' });
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    if (path === '/telegram/webhook') {
      if (!env.TELEGRAM_WEBHOOK_SECRET ||
          !constantTimeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: 'unauthorized' },401);
      try {
        const update = await request.json();
        if (!update || !Number.isSafeInteger(update.update_id)) return json({ error: 'invalid update' },400);
        await telegramUpdate(env,update);
        return json({ ok: true });
      } catch (err) {
        console.error('Telegram webhook failed:',err.message);
        return json({ error: 'processing failed' },500);
      }
    }
    if (path === '/sepay/webhook') {
      if (!env.SEPAY_WEBHOOK_API_KEY || !constantTimeEqual(request.headers.get('Authorization'),'Apikey ' + env.SEPAY_WEBHOOK_API_KEY)) return json({ error: 'unauthorized' },401);
      try { return await sepayWebhook(env,await request.json(),ctx); }
      catch (err) { console.error('SePay webhook failed:',err.message); return json({ success: false },500); }
    }
    return json({ error:'not found' },404);
  }
};
