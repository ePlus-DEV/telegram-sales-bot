// Payment lifecycle kept in sidecar tables to preserve existing order FKs and
// status constraints. Never automatically refund a charge or release inventory
// after Telegram pre-checkout was authorized.
const clampMinutes = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 5 && n <= 10080 ? n : fallback;
};

export async function isExpired(env, id) {
  return !!(await env.DB.prepare('SELECT 1 FROM order_expirations WHERE order_id=?').bind(id).first());
}

export async function expirePendingOrders(env, { limit = 40 } = {}) {
  const max = Math.max(1,Math.min(Number(limit) || 40,100));
  const physicalAge = '-' + clampMinutes(env.PHYSICAL_ORDER_TTL_MINUTES,30) + ' minutes';
  const digitalAge = '-' + clampMinutes(env.STARS_ORDER_TTL_MINUTES,1440) + ' minutes';
  const rows = await env.DB.prepare(
    "SELECT o.id,o.kind FROM orders o WHERE o.status='PENDING' "
    + 'AND NOT EXISTS (SELECT 1 FROM order_expirations e WHERE e.order_id=o.id) '
    + "AND ((o.kind='physical' AND o.created_at<=datetime('now',?)) "
    + "OR (o.kind='digital' AND o.created_at<=datetime('now',?))) "
    + 'AND NOT EXISTS (SELECT 1 FROM purchase_intents p WHERE p.order_id=o.id AND p.checkout_query_id IS NOT NULL) '
    + 'ORDER BY o.created_at ASC LIMIT ?'
  ).bind(physicalAge,digitalAge,max).all();
  let expired = 0, releasedKeys = 0;
  for (const order of rows.results) {
    // Atomic with pre-checkout's NOT EXISTS(expiration) guard. One transaction
    // wins: either the order is expired or the Stars checkout is authorized.
    const results = await env.DB.batch([
      env.DB.prepare(
        'INSERT OR IGNORE INTO order_expirations(order_id) '
        + "SELECT o.id FROM orders o WHERE o.id=? AND o.status='PENDING' "
        + 'AND NOT EXISTS(SELECT 1 FROM order_expirations e WHERE e.order_id=o.id) '
        + "AND ((o.kind='physical' AND o.created_at<=datetime('now',?)) "
        + "OR (o.kind='digital' AND o.created_at<=datetime('now',?))) "
        + 'AND NOT EXISTS(SELECT 1 FROM purchase_intents p WHERE p.order_id=o.id AND p.checkout_query_id IS NOT NULL)'
      ).bind(order.id,physicalAge,digitalAge),
      env.DB.prepare(
        'UPDATE digital_inventory SET reserved_order_id=NULL WHERE reserved_order_id=? '
        + 'AND delivered_order_id IS NULL '
        + 'AND EXISTS(SELECT 1 FROM order_expirations WHERE order_id=?)'
      ).bind(order.id,order.id)
    ]);
    expired += results[0].meta.changes;
    releasedKeys += results[1].meta.changes;
  }
  return { expired, releasedKeys };
}

export async function recordBankReview(env, payment, reason) {
  if (!['UNKNOWN_ORDER','AMOUNT_MISMATCH','EXPIRED_ORDER','ALREADY_PAID'].includes(reason))
    throw new Error('Invalid bank reconciliation reason');
  await env.DB.prepare(
    'INSERT OR IGNORE INTO bank_payment_reviews(event_id,order_id,bank_account,amount_vnd,reason) '
    + 'VALUES(?,?,?,?,?)'
  ).bind(payment.eventId,payment.orderId,String(env.BANK_ACCOUNT_NO),payment.amount,reason).run();
}

export async function listBankReviews(env, max = 10) {
  const {results} = await env.DB.prepare(
    'SELECT event_id,order_id,amount_vnd,reason FROM bank_payment_reviews '
    + 'WHERE acknowledged_at IS NULL ORDER BY received_at ASC LIMIT ?'
  ).bind(max).all();
  return results;
}

export async function acknowledgeBankReview(env, eventId) {
  if (!/^\d{1,30}$/.test(String(eventId))) return false;
  const result = await env.DB.prepare(
    'UPDATE bank_payment_reviews SET acknowledged_at=CURRENT_TIMESTAMP '
    + 'WHERE event_id=? AND acknowledged_at IS NULL'
  ).bind(String(eventId)).run();
  return !!result.meta.changes;
}

export async function listRefundReviews(env, max = 10) {
  const {results} = await env.DB.prepare(
    "SELECT order_id,state,requested_at FROM star_refunds WHERE state!='CONFIRMED' "
    + 'ORDER BY requested_at ASC LIMIT ?'
  ).bind(max).all();
  return results;
}

export async function refundPaidStars(env, orderId, telegram) {
  const id = String(orderId || '').trim();
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE id=? AND provider='stars' AND kind='digital' AND status='PAID' AND payment_ref IS NOT NULL"
  ).bind(id).first();
  if (!order) return { status:'DENIED',detail:'Chỉ được hoàn Stars cho đơn PAID chưa giao hàng.' };
  const userId = Number(order.user_id);
  if (!Number.isSafeInteger(userId) || userId < 1)
    return { status:'DENIED',detail:'Telegram user ID không hợp lệ.' };
  // Conditional DB insert acts as the refund lock: no other call can refund
  // the same order, even if two admins issue the command concurrently.
  const locked = await env.DB.prepare(
    'INSERT OR IGNORE INTO star_refunds(order_id,user_id,charge_id,state) '
    + "SELECT o.id,o.user_id,o.payment_ref,'CALLING' FROM orders o "
    + "WHERE o.id=? AND o.status='PAID' AND o.provider='stars' "
    + 'AND NOT EXISTS(SELECT 1 FROM digital_inventory WHERE delivered_order_id=o.id) '
    + 'AND NOT EXISTS(SELECT 1 FROM star_refunds WHERE order_id=o.id)'
  ).bind(id).run();
  if (!locked.meta.changes) {
    const existing = await env.DB.prepare('SELECT state FROM star_refunds WHERE order_id=?').bind(id).first();
    return {status:existing?.state || 'DENIED',detail:'Không được gọi hoàn tiền lặp. Kiểm tra đối soát trước.'};
  }
  try {
    // Network failures have an UNKNOWN outcome: never automatically repeat
    // refundStarPayment. Mark NEEDS_REVIEW instead of risking double refund.
    const ok = await telegram(env,'refundStarPayment',{
      user_id:userId,telegram_payment_charge_id:order.payment_ref
    });
    if (ok !== true) throw new Error('Telegram returned a non-success refund result');
    await env.DB.prepare(
      "UPDATE star_refunds SET state='CONFIRMED',completed_at=CURRENT_TIMESTAMP,note=NULL "
      + "WHERE order_id=? AND state='CALLING'"
    ).bind(id).run();
    return {status:'CONFIRMED',detail:'Telegram xác nhận hoàn Stars thành công.'};
  } catch (error) {
    console.error('Stars refund requires reconciliation:',error.message);
    await env.DB.prepare(
      "UPDATE star_refunds SET state='NEEDS_REVIEW',note='Verify with Telegram before any retry' "
      + "WHERE order_id=? AND state='CALLING'"
    ).bind(id).run();
    return {status:'NEEDS_REVIEW',detail:'Kết quả chưa chắc chắn. Kiểm tra giao dịch Telegram; không gửi yêu cầu hoàn tiền lần hai.'};
  }
}
