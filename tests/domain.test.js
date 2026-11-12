import test from 'node:test';
import assert from 'node:assert/strict';
import { constantTimeEqual, createOrderId, validPositiveInt, sepayPayment, vietQrUrl, orderPaymentMatches } from '../src/domain.js';

const sepay = { id: 91, accountNumber: '12345678', transferType: 'in', transferAmount: 50000, content: 'thanh toan EABCDEF123456' };

test('order codes are non-sequential, 13 chars and unique', () => {
  const codes = Array.from({ length: 100 }, createOrderId);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code,/^E[A-F0-9]{12}$/);
});

test('SePay must match exact account, direction, amount, and standalone code', () => {
  assert.deepEqual(sepayPayment(sepay,'12345678'), { eventId:'91', orderId:'EABCDEF123456', amount:50000 });
  assert.equal(sepayPayment({ ...sepay, accountNumber:'9999' },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, transferType:'out' },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, transferAmount:0 },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, transferAmount:50000.5 },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, id:'bad' },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, content:'XEABCDEF123456Y' },'12345678'),null);
  assert.equal(sepayPayment({ ...sepay, content:'EABCDEF1234567' },'12345678'),null);
});

test('positive integer guards and QR generation', () => {
  assert.equal(validPositiveInt('15'),15);
  for (const value of [0,-1,'1.5','-2','2hello','Infinity']) assert.equal(validPositiveInt(value),null);
  const url = new URL(vietQrUrl({ BANK_BIN:'970422', BANK_ACCOUNT_NO:'12345678', BANK_ACCOUNT_NAME:'TEST CUSTOMER' },'EABCDEF123456',50000));
  assert.equal(url.searchParams.get('amount'),'50000');
  assert.equal(url.searchParams.get('addInfo'),'EABCDEF123456');
  assert.ok(url.hostname === 'img.vietqr.io');
  assert.throws(() => vietQrUrl({BANK_BIN:'not a BIN', BANK_ACCOUNT_NO:'1234'},'EABCDEF123456',50000));
});

test('constant-time equality helper and Stars order constraints', () => {
  assert.equal(constantTimeEqual('abc','abc'),true);
  assert.equal(constantTimeEqual('abc','abd'),false);
  assert.equal(constantTimeEqual(null,'abc'),false);
  const order = { user_id:'42', provider:'stars', status:'PENDING', kind:'digital', total_stars:50 };
  assert.equal(orderPaymentMatches(order,42,50,'stars'),true);
  assert.equal(orderPaymentMatches(order,43,50,'stars'),false);
  assert.equal(orderPaymentMatches({...order,status:'FULFILLED'},42,50,'stars'),false);
  assert.equal(orderPaymentMatches({...order,kind:'physical'},42,50,'stars'),false);
});
