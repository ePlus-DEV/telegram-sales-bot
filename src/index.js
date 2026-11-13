import { constantTimeEqual, validPositiveInt, sepayPayment } from './domain.js';
import { createPurchase, recoverInvoice, approvePrecheckout } from './purchase.js';
import { enqueueNotification, flushNotifications } from './notifications.js';
import { expirePendingOrders, recordBankReview, listBankReviews, acknowledgeBankReview, listRefundReviews, refundPaidStars } from './reconciliation.js';
import { handleAdminRequest } from './admin/handler.js';
import { selectBotEnvironment, allBotEnvironments } from './multi-bot.js';
import {t,money,languageFor,languageForId,setLanguage,statusLabel} from './i18n.js';

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

async function catalog(env, chatId, lang) {
  const rows = await env.DB.prepare('SELECT id,name,description,kind,price_vnd,price_stars FROM products WHERE active=1 ORDER BY id DESC LIMIT 30').all();
  if (!rows.results.length) return send(env, chatId,t(lang,'noProducts'));
  await send(env, chatId,t(lang,'catalogTitle'));
  for (const p of rows.results) {
    const price = p.kind === 'digital' ? p.price_stars + ' ⭐' : money(lang,p.price_vnd) + (lang==='en'?' VND':'đ');
    await send(env, chatId, '#' + p.id + ' · ' + p.name + '\n' + p.description + '\n' + price, {
      reply_markup: { inline_keyboard: [[{ text: t(lang,'buy'), callback_data: 'buy:' + p.id }]] }
    });
  }
}

async function listOrders(env, chatId, userId, admin = false, lang='vi') {
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
    ? rows.results.map(o => o.id + ' · ' + statusLabel(lang,o.display_status) + ' · ' + (o.kind === 'digital' ? o.total_stars + '⭐' : money(lang,o.total_vnd) + (lang==='en'?' VND':'đ')) + (admin ? ' · ' + o.user_id : '')).join('\n')
    : t(lang,'noOrders'));
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

async function adminCommand(env, chatId, text, lang) {
  if (text.startsWith('/addphysical ') || text.startsWith('/adddigital ')) {
    const physical = text.startsWith('/addphysical ');
    const fields = text.slice(physical ? 13 : 12).split('|').map(v => v.trim());
    const amount = validPositiveInt(fields[1], physical ? 999999999 : 100000);
    if (fields.length !== 3 || !fields[0] || fields[0].length > 80 || !amount || fields[2].length > 240) {
      return send(env, chatId, t(lang,'physicalUsage'));
    }
    const result = await env.DB.prepare('INSERT INTO products(name,description,kind,price_vnd,price_stars) VALUES(?,?,?,?,?)')
      .bind(fields[0], fields[2], physical ? 'physical' : 'digital', physical ? amount : 0, physical ? 0 : amount).run();
    return send(env, chatId, t(lang,physical?'productCreatedPhysical':'productCreatedDigital',{id:result.meta.last_row_id}));
  }
  if (text.startsWith('/addkey ')) {
    const match = text.match(/^\/addkey\s+(\d+)\s*\|\s*([\s\S]+)$/);
    if (!match || match[2].length > 2000) return send(env, chatId, t(lang,'keyUsage'));
    const p = await env.DB.prepare("SELECT id FROM products WHERE id=? AND kind='digital'").bind(Number(match[1])).first();
    if (!p) return send(env, chatId, t(lang,'digitalNotFound'));
    await env.DB.prepare('INSERT INTO digital_inventory(product_id,secret_value) VALUES(?,?)').bind(p.id,match[2].trim()).run();
    return send(env, chatId, t(lang,'keyAdded',{id:p.id}));
  }
  if (text === '/admin') return send(env, chatId, t(lang,'adminHelp'));
  if (text === '/adminorders') return listOrders(env, chatId, null, true, lang);
  if (text === '/expireorders') {
    const result = await expirePendingOrders(env,{limit:50});
    return send(env,chatId,t(lang,'expiredReport',{expired:result.expired,keys:result.releasedKeys}));
  }
  if (text === '/bankreviews') {
    const rows = await listBankReviews(env);
    return send(env,chatId,rows.length
      ? t(lang,'bankReviews',{rows:rows.map(x=>x.event_id+' · '+x.order_id+' · '+money(lang,x.amount_vnd)+' VND · '+x.reason).join('\n')})
      : t(lang,'noBankReviews'));
  }
  if (text.startsWith('/ackbank ')) {
    const id=text.slice('/ackbank '.length).trim();
    const ok=await acknowledgeBankReview(env,id);
    return send(env,chatId,ok
      ? t(lang,'bankReviewed',{id})
      : t(lang,'noBankReview'));
  }
  if (text === '/refundreviews') {
    const rows=await listRefundReviews(env);
    return send(env,chatId,rows.length
      ? t(lang,'refundReviews',{rows:rows.map(x=>x.order_id+' · '+x.state).join('\n')})
      : t(lang,'noRefundReviews'));
  }
  if (text.startsWith('/refundstars ')) {
    const result=await refundPaidStars(env,text.slice('/refundstars '.length),telegram,lang);
    return send(env,chatId,t(lang,'refundResponse',{status:result.status,detail:result.detail}));
  }
  if (text === '/retryalerts') {
    try {
      const count = await flushNotifications(env,send,{limit:20});
      return send(env,chatId,t(lang,'retrySent',{count}));
    } catch (error) {
      console.error('Admin notification recovery failed:',error.message);
      return send(env,chatId,t(lang,'retryFailed'));
    }
  }
  if (text.startsWith('/fulfill ')) {
    const id = text.slice(9).trim();
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND kind='physical' AND status='PAID'").bind(id).first();
    if (!order) return send(env, chatId, t(lang,'noPhysicalPaid'));
    const r = await env.DB.prepare("UPDATE orders SET status='FULFILLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PAID'").bind(id).run();
    if (r.meta.changes) {
      await send(env, order.user_id, t(await languageForId(env,order.user_id),'physicalFulfilledNotice',{id}));
      return send(env, chatId, t(lang,'physicalFulfilled',{id}));
    }
  }
  return send(env, chatId, t(lang,'invalidAdmin'));
}

async function telegramUpdate(env, update) {
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const lang=await languageFor(env,q.from);
    const ok = await approvePrecheckout(env,q);
    return telegram(env, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: q.id, ok,
      ...(!ok ? { error_message: t(lang,'invalidCheckout') } : {})
    });
  }
  const message = update.message;
  if (message?.successful_payment) {
    await languageFor(env,message.from);
    return finishStars(env,message);
  }
  const callback = update.callback_query;
  if (callback) {
    // A transient acknowledgement failure must not lose the purchase.
    try {
      await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id});
    } catch (error) {
      console.error('Callback acknowledgement failed:',error.message);
    }
    const lang=await languageFor(env,callback.from);
    const languageChoice=String(callback.data||'').match(/^lang:(vi|en)$/);
    if (languageChoice && callback.message?.chat?.id) {
      const selected=await setLanguage(env,callback.from.id,languageChoice[1]);
      return send(env,callback.message.chat.id,t(selected,'languageSaved'));
    }
    const match = String(callback.data || '').match(/^buy:(\d+)$/);
    const chat = callback.message?.chat;
    if (match && chat?.id && String(chat.id) === String(callback.from?.id)
        && (!chat.type || chat.type === 'private')) {
      return createPurchase(env,{
        callbackId:callback.id,chatId:chat.id,userId:callback.from.id,productId:Number(match[1])
      },telegram,send,lang);
    }
    return;
  }
  if (!message || message.chat?.type !== 'private') return;
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = String(message.text || '').trim();
  const lang=await languageFor(env,message.from);
  if (text === '/start') return send(env, chatId,t(lang,'welcome'));
  if (text === '/help') return send(env, chatId,t(lang,'help'));
  if (text === '/language' || text === '/lang') {
    return send(env,chatId,t(lang,'languagePrompt'),{
      reply_markup:{inline_keyboard:[[
        {text:'🇻🇳 Tiếng Việt',callback_data:'lang:vi'},
        {text:'🇬🇧 English',callback_data:'lang:en'}
      ]]}
    });
  }
  if (text.startsWith('/lang ')) {
    const requested=text.slice(6).trim().toLowerCase();
    if(requested!=='vi' && requested!=='en')
      return send(env,chatId,t(lang,'invalidLanguage'));
    const selected=await setLanguage(env,userId,requested);
    return send(env,chatId,t(selected,'languageSaved'));
  }
  if (text === '/catalog' || text === '/products') return catalog(env, chatId, lang);
  if (text === '/orders') return listOrders(env, chatId, userId, false, lang);
  if (text.startsWith('/invoice ')) return recoverInvoice(env,chatId,userId,text.slice(9),telegram,send,lang);
  if (text.startsWith('/mykey ')) {
    const id = text.slice(7).trim();
    const item = await env.DB.prepare("SELECT i.secret_value FROM orders o JOIN digital_inventory i ON i.delivered_order_id=o.id WHERE o.id=? AND o.user_id=? AND o.status='FULFILLED'").bind(id,String(userId)).first();
    return send(env, chatId, item ? t(lang,'keyFound',{id,secret:item.secret_value}):t(lang,'keyMissing'));
  }
  if (text === '/paysupport') return send(env,chatId,t(lang,'support',{contact:env.SUPPORT_USERNAME?'@'+env.SUPPORT_USERNAME.replace(/^@/,''):t(lang,'supportAdmin')}));
  if (isAdmin(env,userId) && text.startsWith('/')) return adminCommand(env,chatId,text,lang);
  return send(env,chatId,t(lang,'unknownCommand'));
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
    let bots;
    try { bots = allBotEnvironments(env); }
    catch {
      console.error('Scheduled reconciliation: multi-bot configuration invalid');
      return;
    }
    // Every bot owns a different database; a failure must not skip other bots.
    for (const bot of bots) ctx.waitUntil((async () => {
      await expirePendingOrders(bot,{limit:100});
      await flushNotifications(bot,send,{limit:40});
    })().catch(error => {
      console.error('Scheduled reconciliation failed:',error.message);
      throw error;
    }));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      const scoped = selectBotEnvironment(env,url.hostname);
      if (!scoped) return json({ error:'not found' },404);
      if (scoped !== env && (!scoped.DB || typeof scoped.DB.prepare !== 'function'))
        return json({ error:'bot database unavailable' },503);
      env = scoped;
    } catch {
      console.error('Multi-bot configuration invalid');
      return json({ error:'configuration error' },503);
    }
    const path = url.pathname;
    if (path === '/admin' || path.startsWith('/admin/')) return handleAdminRequest(request,env);
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
