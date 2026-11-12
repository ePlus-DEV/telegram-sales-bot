import { constantTimeEqual, validPositiveInt, sepayPayment } from './domain.js';
import { createPurchase, recoverInvoice, approvePrecheckout } from './purchase.js';
import { enqueueNotification, flushNotifications } from './notifications.js';
import { expirePendingOrders, recordBankReview, listBankReviews, acknowledgeBankReview, listRefundReviews, refundPaidStars } from './reconciliation.js';

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
  const projection = "SELECT o.id,o.user_id,o.kind,o.status,o.total_vnd,o.total_stars,"
    + "CASE WHEN r.state='CONFIRMED' THEN 'REFUNDED' "
    + "WHEN r.state IS NOT NULL THEN 'REFUND_'||r.state "
    + "WHEN e.order_id IS NOT NULL AND o.status='PENDING' THEN 'EXPIRED' "
    + "ELSE o.status END AS display_status "
    + 'FROM orders o LEFT JOIN order_expirations e ON e.order_id=o.id '
    + 'LEFT JOIN star_refunds r ON r.order_id=o.id ';
  const stmt = admin
    ? env.DB.prepare(projection+'ORDER BY o.created_at DESC LIMIT 10')
    : env.DB.prepare(projection+'WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 10').bind(String(userId));
  const rows = await stmt.all();
  return send(env, chatId, rows.results.length
    ? rows.results.map(o => o.id + ' · ' + o.display_status + ' · ' + (o.kind === 'digital' ? o.total_stars + '⭐' : o.total_vnd + 'đ') + (admin ? ' · ' + o.user_id : '')).join('\n')
    : 'Chưa có đơn hàng.');
}

async function finishStars(env, message) {
  const payment = message.successful_payment;
  const id = String(payment.invoice_payload || '');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!order || !['PENDING','PAID','FULFILLED'].includes(order.status)) return;
  const charge = String(payment.telegram_payment_charge_id || '');
  if (!charge || payment.currency !== 'XTR' || String(order.user_id) !== String(message.from?.id) ||
      order.kind !== 'digital' || order.provider !== 'stars' || order.total_stars !== payment.total_amount) return;
  // The (provider, event_id) PK prevents a charge from being applied to any
  // second order. Replayed successful_payment events resume unfinished delivery.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO payment_events(provider,event_id,order_id) VALUES(?,?,?)').bind('stars',charge,id),
    env.DB.prepare(
      "UPDATE orders SET status='PAID',payment_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM payment_events WHERE provider='stars' AND event_id=? AND order_id=?)"
    ).bind(charge,id,charge,id)
  ]);
  const ownsCharge = await env.DB.prepare('SELECT 1 FROM payment_events WHERE provider=? AND event_id=? AND order_id=?')
    .bind('stars',charge,id).first();
  if (!ownsCharge) return;
  let current = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (current.status === 'PAID') {
    // Both changes are atomic: a key cannot be marked delivered twice, and an
    // order is never fulfilled unless inventory is attached to that order.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE digital_inventory SET delivered_order_id=?,reserved_order_id=NULL WHERE reserved_order_id=? AND delivered_order_id IS NULL "
        + "AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='PAID') "
        + 'AND NOT EXISTS(SELECT 1 FROM order_expirations WHERE order_id=?) '
        + 'AND NOT EXISTS(SELECT 1 FROM star_refunds WHERE order_id=?)'
      ).bind(id,id,id,id,id),
      env.DB.prepare(
        "UPDATE orders SET status='FULFILLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID' "
        + 'AND EXISTS(SELECT 1 FROM digital_inventory WHERE delivered_order_id=?) '
        + 'AND NOT EXISTS(SELECT 1 FROM order_expirations WHERE order_id=?) '
        + 'AND NOT EXISTS(SELECT 1 FROM star_refunds WHERE order_id=?)'
      ).bind(id,id,id,id)
    ]);
    current = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  }
  // A refund operation is a permanent settlement barrier. Telegram charge
  // replays must not re-allocate inventory after a refund has started.
  const refund = await env.DB.prepare('SELECT state FROM star_refunds WHERE order_id=?').bind(id).first();
  if (refund) return;
  if (current.status === 'FULFILLED') {
    await enqueueNotification(env,id,'stars_key',current.user_id);
  } else if (current.status === 'PAID') {
    // Never silently drop a captured Stars payment when inventory is missing.
    await enqueueNotification(env,id,'stars_review_customer',current.user_id);
    if (adminId(env)) await enqueueNotification(env,id,'stars_review_admin',adminId(env));
  }
  // Return 5xx on delivery failure; Telegram can retry the webhook and the
  // outbox sends only unsent notifications. /retryalerts is the manual fallback.
  await flushNotifications(env,send,{ orderId:id });
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
  if (text === '/admin') return send(env, chatId, 'Quản trị:\n/addphysical Tên | VND | Mô tả\n/adddigital Tên | Stars | Mô tả\n/addkey ID | Key\n/adminorders\n/expireorders\n/bankreviews\n/ackbank MÃ_GIAO_DỊCH\n/refundstars MÃ_ĐƠN\n/refundreviews\n/retryalerts\n/fulfill MÃ_ĐƠN');
  if (text === '/adminorders') return listOrders(env, chatId, null, true);
  if (text === '/expireorders') {
    const result = await expirePendingOrders(env,{limit:50});
    return send(env,chatId,'Đã hết hạn '+result.expired+' đơn, giải phóng '+result.releasedKeys+' key. Đơn đã duyệt pre-checkout được giữ lại.');
  }
  if (text === '/bankreviews') {
    const rows = await listBankReviews(env);
    return send(env,chatId,rows.length
      ? 'Giao dịch cần đối soát (không tự cộng tiền):\n'
        + rows.map(x=>x.event_id+' · '+x.order_id+' · '+x.amount_vnd+'đ · '+x.reason).join('\n')
      : 'Không có giao dịch ngân hàng chờ đối soát.');
  }
  if (text.startsWith('/ackbank ')) {
    const id=text.slice('/ackbank '.length).trim();
    const ok=await acknowledgeBankReview(env,id);
    return send(env,chatId,ok
      ? 'Đã đánh dấu đối soát '+id+'. Chỉ là ghi nhận thủ công; không hoàn tiền hay cộng số dư.'
      : 'Không tìm thấy giao dịch chờ đối soát.');
  }
  if (text === '/refundreviews') {
    const rows=await listRefundReviews(env);
    return send(env,chatId,rows.length
      ? 'Hoàn Stars cần xác minh với Telegram:\n'+rows.map(x=>x.order_id+' · '+x.state).join('\n')
      : 'Không có hoàn Stars đang chờ xác minh.');
  }
  if (text.startsWith('/refundstars ')) {
    const result=await refundPaidStars(env,text.slice('/refundstars '.length),telegram);
    return send(env,chatId,'Hoàn Stars: '+result.status+'\n'+result.detail);
  }
  if (text === '/retryalerts') {
    try {
      const count = await flushNotifications(env,send,{limit:20});
      return send(env,chatId,'✅ Đã gửi lại ' + count + ' thông báo đang chờ. Chạy lại để xử lý tiếp nếu cần.');
    } catch (error) {
      console.error('Admin notification recovery failed:',error.message);
      return send(env,chatId,'⚠️ Gửi lại thông báo thất bại. Kiểm tra logs và thử /retryalerts sau.');
    }
  }
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
    const ok = await approvePrecheckout(env,q);
    return telegram(env, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: q.id, ok,
      ...(!ok ? { error_message: 'Đơn không hợp lệ hoặc đã được thanh toán. Vui lòng đặt lại.' } : {})
    });
  }
  const message = update.message;
  if (message?.successful_payment) return finishStars(env, message);
  const callback = update.callback_query;
  if (callback) {
    // A transient acknowledgement failure must not lose the purchase.
    try {
      await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id});
    } catch (error) {
      console.error('Callback acknowledgement failed:',error.message);
    }
    const match = String(callback.data || '').match(/^buy:(\d+)$/);
    const chat = callback.message?.chat;
    if (match && chat?.id && String(chat.id) === String(callback.from?.id)
        && (!chat.type || chat.type === 'private')) {
      return createPurchase(env,{
        callbackId:callback.id,chatId:chat.id,userId:callback.from.id,productId:Number(match[1])
      },telegram,send);
    }
    return;
  }
  if (!message || message.chat?.type !== 'private') return;
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = String(message.text || '').trim();
  if (text === '/start') return send(env, chatId, '👋 Chào mừng đến ePlus Telegram Sales Bot!\n/catalog — Sản phẩm\n/orders — Đơn hàng\n/invoice MÃ_ĐƠN — Link Stars\n/help — Trợ giúp');
  if (text === '/help') return send(env, chatId, 'Lệnh: /catalog, /orders, /invoice MÃ_ĐƠN, /mykey MÃ_ĐƠN, /paysupport.\nSản phẩm số thanh toán bằng Telegram Stars. Hàng vật lý dùng QR ngân hàng và SePay.');
  if (text === '/catalog' || text === '/products') return catalog(env, chatId);
  if (text === '/orders') return listOrders(env, chatId, userId);
  if (text.startsWith('/invoice ')) return recoverInvoice(env,chatId,userId,text.slice(9),telegram,send);
  if (text.startsWith('/mykey ')) {
    const id = text.slice(7).trim();
    const item = await env.DB.prepare("SELECT i.secret_value FROM orders o JOIN digital_inventory i ON i.delivered_order_id=o.id WHERE o.id=? AND o.user_id=? AND o.status='FULFILLED'").bind(id,String(userId)).first();
    return send(env, chatId, item ? '🔑 Key của đơn ' + id + ':\n' + item.secret_value : 'Không tìm thấy key được phép truy cập.');
  }
  if (text === '/paysupport') return send(env, chatId, 'Hỗ trợ thanh toán: ' + (env.SUPPORT_USERNAME ? '@' + env.SUPPORT_USERNAME.replace(/^@/, '') : 'Liên hệ admin cửa hàng.'));
  if (isAdmin(env,userId) && text.startsWith('/')) return adminCommand(env,chatId,text);
  return send(env, chatId, 'Dùng /catalog để xem sản phẩm hoặc /help để được hỗ trợ.');
}

async function sepayWebhook(env, body) {
  const tx = sepayPayment(body,env.BANK_ACCOUNT_NO);
  if (!tx) return json({ success:true, matched:false });
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE id=? AND kind='physical' AND provider='sepay'"
  ).bind(tx.orderId).first();
  if (!order) {
    await recordBankReview(env,tx,'UNKNOWN_ORDER');
    return json({success:true,matched:false,review:true});
  }
  if (order.total_vnd !== tx.amount) {
    await recordBankReview(env,tx,'AMOUNT_MISMATCH');
    return json({success:true,matched:false,review:true});
  }
  const expiration = await env.DB.prepare('SELECT 1 FROM order_expirations WHERE order_id=?')
    .bind(tx.orderId).first();
  if (expiration) {
    await recordBankReview(env,tx,'EXPIRED_ORDER');
    return json({success:true,matched:false,review:true});
  }
  if (order.status !== 'PENDING' && order.payment_ref !== tx.eventId) {
    await recordBankReview(env,tx,'ALREADY_PAID');
    return json({success:true,matched:false,review:true});
  }
  let newlyPaid = false;
  if (order.status === 'PENDING') {
    const results = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO payment_events(provider,event_id,order_id) "
        + "SELECT 'sepay',?,? WHERE EXISTS(SELECT 1 FROM orders "
        + "WHERE id=? AND status='PENDING' AND total_vnd=?) "
        + 'AND NOT EXISTS(SELECT 1 FROM order_expirations WHERE order_id=?)'
      ).bind(tx.eventId,tx.orderId,tx.orderId,tx.amount,tx.orderId),
      env.DB.prepare(
        "UPDATE orders SET status='PAID',payment_ref=?,updated_at=CURRENT_TIMESTAMP "
        + "WHERE id=? AND status='PENDING' AND provider='sepay' AND total_vnd=? "
        + 'AND NOT EXISTS(SELECT 1 FROM order_expirations WHERE order_id=?) '
        + "AND EXISTS(SELECT 1 FROM payment_events WHERE provider='sepay' AND event_id=? AND order_id=?)"
      ).bind(tx.eventId,tx.orderId,tx.amount,tx.orderId,tx.eventId,tx.orderId)
    ]);
    newlyPaid = !!results[1].meta.changes;
  }
  const current = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(tx.orderId).first();
  if (!['PAID','FULFILLED'].includes(current?.status) || current.payment_ref !== tx.eventId) {
    const expiredNow = await env.DB.prepare('SELECT 1 FROM order_expirations WHERE order_id=?').bind(tx.orderId).first();
    await recordBankReview(env,tx,expiredNow?'EXPIRED_ORDER':'ALREADY_PAID');
    return json({ success:true,matched:false,review:true });
  }
  await enqueueNotification(env,tx.orderId,'physical_paid_customer',current.user_id);
  if (adminId(env)) await enqueueNotification(env,tx.orderId,'physical_paid_admin',adminId(env));
  await flushNotifications(env,send,{orderId:tx.orderId});
  return json({ success:true,matched:newlyPaid });
}
export default {
  async scheduled(_controller,env,ctx) {
    ctx.waitUntil((async () => {
      await expirePendingOrders(env,{limit:100});
      await flushNotifications(env,send,{limit:40});
    })().catch(error => {
      console.error('Scheduled reconciliation failed:',error.message);
      throw error;
    }));
  },
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
      try { return await sepayWebhook(env,await request.json()); }
      catch (err) { console.error('SePay webhook failed:',err.message); return json({ success: false },500); }
    }
    return json({ error:'not found' },404);
  }
};
