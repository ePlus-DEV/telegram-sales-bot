// Pure domain helpers: deliberately no database, network, or Telegram SDK dependencies.
export function constantTimeEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function createOrderId() {
  return 'E' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
}

export function validPositiveInt(value, max = 999999999) {
  const text = String(value ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

export function sepayPayment(event, bankAccount) {
  if (!event || typeof event !== 'object') return null;
  const eventId = String(event.id ?? '');
  if (!/^\d{1,30}$/.test(eventId)) return null;
  if (event.transferType !== 'in' || String(event.accountNumber ?? '') !== String(bankAccount ?? '')) return null;
  if (!Number.isSafeInteger(event.transferAmount) || event.transferAmount <= 0) return null;
  const content = String(event.content ?? '').toUpperCase();
  // Require an exact standalone, unpredictable order token, never substring matching.
  const match = content.match(/(?:^|[^A-Z0-9])(E[A-F0-9]{12})(?=$|[^A-Z0-9])/);
  if (!match) return null;
  return { eventId, orderId: match[1], amount: event.transferAmount };
}

export function vietQrUrl(env, orderId, amount) {
  const bin = String(env.BANK_BIN ?? '');
  const account = String(env.BANK_ACCOUNT_NO ?? '');
  if (!/^\d{6}$/.test(bin) || !/^\d{4,22}$/.test(account)) throw new Error('Invalid bank configuration');
  if (!/^E[A-F0-9]{12}$/.test(orderId) || !validPositiveInt(amount)) throw new Error('Invalid order');
  const base = 'https://img.vietqr.io/image/' + encodeURIComponent(bin) + '-' + encodeURIComponent(account) + '-compact2.png';
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: orderId,
    accountName: String(env.BANK_ACCOUNT_NAME ?? '')
  });
  return base + '?' + query.toString();
}

export function orderPaymentMatches(order, paymentUserId, paidAmount, provider) {
  return !!order && order.provider === provider && order.status === 'PENDING' &&
    String(order.user_id) === String(paymentUserId) &&
    provider === 'stars' && order.kind === 'digital' &&
    order.total_stars === paidAmount;
}
