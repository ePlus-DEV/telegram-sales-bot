import {t,money,languageForId} from './i18n.js';
// Durable payment notifications. Only the order reference goes into the outbox:
// secret keys stay in digital_inventory and are looked up just before delivery.
// Telegram does not support idempotent sendMessage; a crash after a successful
// send but before sent_at is recorded can produce a duplicate message.
const STATUSES = {
  stars_key: 'key',
  stars_review_customer: 'review_customer',
  stars_review_admin: 'review_admin',
  physical_paid_customer: 'physical_customer',
  physical_paid_admin: 'physical_admin'
};

export async function enqueueNotification(env, orderId, kind, recipientId) {
  if (!STATUSES[kind] || !recipientId) throw new Error('Invalid notification');
  return env.DB.prepare(
    'INSERT OR IGNORE INTO notification_outbox(order_id,kind,recipient_id) VALUES(?,?,?)'
  ).bind(orderId,kind,String(recipientId)).run();
}

function notificationText(row,lang) {
  if(row.kind==='stars_key') {
    if(!row.secret_value)throw new Error('Paid order is missing its delivered inventory key');
    return t(lang,'starsDelivered',{id:row.order_id,secret:row.secret_value});
  }
  if(row.kind==='stars_review_customer')
    return t(lang,'starsAwaitDelivery',{id:row.order_id});
  if(row.kind==='stars_review_admin')
    return t(lang,'starsAdminAlert',{id:row.order_id});
  if(row.kind==='physical_paid_customer')
    return t(lang,'physicalPaidCustomer',{id:row.order_id,amount:money(lang,row.total_vnd)});
  if(row.kind==='physical_paid_admin')
    return t(lang,'physicalPaidAdmin',{id:row.order_id});
  throw new Error('Unknown notification kind');
}

export async function flushNotifications(env, send, { orderId = null, limit = 20 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 20,1),50);
  const stmt = orderId
    ? env.DB.prepare(
      'SELECT n.id,n.kind,n.recipient_id,n.order_id,o.total_vnd,i.secret_value '
      + 'FROM notification_outbox n JOIN orders o ON o.id=n.order_id '
      + 'LEFT JOIN digital_inventory i ON i.delivered_order_id=o.id '
      + "WHERE n.order_id=? AND (n.state='PENDING' OR (n.state='SENDING' AND n.lease_until<=CURRENT_TIMESTAMP)) "
      + 'ORDER BY n.id LIMIT ?'
    ).bind(orderId,max)
    : env.DB.prepare(
      'SELECT n.id,n.kind,n.recipient_id,n.order_id,o.total_vnd,i.secret_value '
      + 'FROM notification_outbox n JOIN orders o ON o.id=n.order_id '
      + 'LEFT JOIN digital_inventory i ON i.delivered_order_id=o.id '
      + "WHERE n.state='PENDING' OR (n.state='SENDING' AND n.lease_until<=CURRENT_TIMESTAMP) "
      + 'ORDER BY n.id LIMIT ?'
    ).bind(max);
  const { results } = await stmt.all();
  let delivered = 0;
  for (const row of results) {
    // Lease claims prevent two concurrent webhook retries from sending at once.
    // A crash is recovered after the lease expires.
    const lease = await env.DB.prepare(
      "UPDATE notification_outbox SET state='SENDING',attempts=attempts+1,"
      + "lease_until=datetime('now','+60 seconds') WHERE id=? AND "
      + "(state='PENDING' OR (state='SENDING' AND lease_until<=CURRENT_TIMESTAMP))"
    ).bind(row.id).run();
    if (!lease.meta.changes) continue;
    try {
      const lang=await languageForId(env,row.recipient_id);
      await send(env,row.recipient_id,notificationText(row,lang));
      await env.DB.prepare(
        "UPDATE notification_outbox SET state='SENT',sent_at=CURRENT_TIMESTAMP,lease_until=NULL WHERE id=? AND state='SENDING'"
      ).bind(row.id).run();
      delivered++;
    } catch (error) {
      await env.DB.prepare(
        "UPDATE notification_outbox SET state='PENDING',lease_until=NULL WHERE id=? AND state='SENDING'"
      ).bind(row.id).run();
      throw error;
    }
  }
  return delivered;
}
