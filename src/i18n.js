// Portable bilingual catalog: deliberately no i18n runtime/CDN dependency.
// User-supplied product names/descriptions remain unmodified.
const catalog = {
  vi: {
    noProducts: 'Chưa có sản phẩm. Vui lòng quay lại sau.',
    catalogTitle: '🛍 Danh sách sản phẩm (tối đa 30 mục):',
    buy: '🛒 Mua',
    noOrders: 'Chưa có đơn hàng.',
    physicalUsage: 'Cú pháp: /addphysical Tên | Giá VND | Mô tả\nhoặc /adddigital Tên | Giá Stars | Mô tả',
    productCreatedPhysical: 'Đã tạo sản phẩm #{id} (hàng vật lý)',
    productCreatedDigital: 'Đã tạo sản phẩm #{id} (sản phẩm số - Stars)',
    keyUsage: 'Cú pháp: /addkey ID | Giá trị key/tài khoản',
    digitalNotFound: 'Sản phẩm số không tồn tại.',
    keyAdded: 'Đã bổ sung 1 key cho sản phẩm #{id}',
    adminHelp: 'Quản trị:\n/addphysical Tên | VND | Mô tả\n/adddigital Tên | Stars | Mô tả\n/addkey ID | Key\n/adminorders\n/expireorders\n/bankreviews\n/ackbank MÃ_GIAO_DỊCH\n/refundstars MÃ_ĐƠN\n/refundreviews\n/retryalerts\n/fulfill MÃ_ĐƠN',
    expiredReport: 'Đã hết hạn {expired} đơn, giải phóng {keys} key. Đơn đã duyệt pre-checkout được giữ lại.',
    bankReviews: 'Giao dịch cần đối soát (không tự cộng tiền):\n{rows}',
    noBankReviews: 'Không có giao dịch ngân hàng chờ đối soát.',
    bankReviewed: 'Đã đánh dấu đối soát {id}. Chỉ là ghi nhận thủ công; không hoàn tiền hay cộng số dư.',
    noBankReview: 'Không tìm thấy giao dịch chờ đối soát.',
    refundReviews: 'Hoàn Stars cần xác minh với Telegram:\n{rows}',
    noRefundReviews: 'Không có hoàn Stars đang chờ xác minh.',
    refundResponse: 'Hoàn Stars: {status}\n{detail}',
    retrySent: '✅ Đã gửi lại {count} thông báo đang chờ. Chạy lại để xử lý tiếp nếu cần.',
    retryFailed: '⚠️ Gửi lại thông báo thất bại. Kiểm tra logs và thử /retryalerts sau.',
    noPhysicalPaid: 'Không có đơn vật lý đã thanh toán đang chờ xử lý.',
    physicalFulfilledNotice: '✅ Đơn {id} đã được admin đánh dấu hoàn tất.',
    physicalFulfilled: 'Đã hoàn tất {id}',
    invalidAdmin: 'Lệnh quản trị chưa hợp lệ. Dùng /admin.',
    invalidCheckout: 'Đơn không hợp lệ hoặc đã được thanh toán. Vui lòng đặt lại.',
    welcome: '👋 Chào mừng đến ePlus Telegram Sales Bot!\n/catalog — Sản phẩm\n/orders — Đơn hàng\n/invoice MÃ_ĐƠN — Link Stars\n/language — Ngôn ngữ\n/help — Trợ giúp',
    help: 'Lệnh: /catalog, /orders, /invoice MÃ_ĐƠN, /mykey MÃ_ĐƠN, /language, /paysupport.\nSản phẩm số thanh toán bằng Telegram Stars. Hàng vật lý dùng QR ngân hàng và SePay.',
    keyFound: '🔑 Key của đơn {id}:\n{secret}',
    keyMissing: 'Không tìm thấy key được phép truy cập.',
    support: 'Hỗ trợ thanh toán: {contact}',
    supportAdmin: 'Liên hệ admin cửa hàng.',
    unknownCommand: 'Dùng /catalog để xem sản phẩm hoặc /help để được hỗ trợ.',
    languagePrompt: '🌐 Chọn ngôn ngữ / Choose a language:',
    languageSaved: '✅ Đã chuyển sang tiếng Việt.',
    invalidLanguage: 'Ngôn ngữ không được hỗ trợ. Dùng /lang vi hoặc /lang en.',
    physicalExpired: 'Đơn {id} đã hết hạn. Không chuyển khoản; liên hệ hỗ trợ nếu đã chuyển tiền.',
    physicalAlready: 'Đơn {id} có trạng thái {status}. Không chuyển khoản lại; kiểm tra /orders hoặc liên hệ hỗ trợ.',
    physicalReceipt: 'Đơn {id}\nSản phẩm: {name}\nSố tiền: {amount}đ\nNgân hàng BIN: {bin}\nSTK: {account}\nNội dung bắt buộc: {id}\nQR: {qr}\nChỉ chuyển đúng số tiền/nội dung. Đơn được xử lý khi SePay xác nhận.',
    invoiceExpired: 'Đơn {id} đã hết hạn. Vui lòng tạo đơn Stars mới.',
    invoiceAlready: 'Đơn {id} đã được xử lý ({status}). Kiểm tra /orders hoặc /mykey {id}',
    invoiceMissing: 'Không tìm thấy hóa đơn. Liên hệ hỗ trợ.',
    invoiceCreating: '⏳ Hóa đơn {id} đang được tạo. Dùng /invoice {id} để lấy lại link sau ít phút.',
    invoicePay: '⭐ Đơn {id}\n{name} · {stars} Stars\nNhấn nút bên dưới để thanh toán. Xem lại: /invoice {id}',
    invoiceButton: '⭐ Thanh toán Stars',
    orderMissing: 'Đơn hàng không còn tồn tại. Liên hệ hỗ trợ.',
    invalidPurchase: 'Yêu cầu đặt hàng không hợp lệ.',
    mismatchedPurchase: 'Yêu cầu đặt hàng không khớp.',
    productMissing: 'Không tìm thấy sản phẩm.',
    bankNotConfigured: 'Thanh toán ngân hàng chưa được cấu hình.',
    productUnavailable: 'Sản phẩm không còn khả dụng.',
    stockEmpty: 'Sản phẩm đã hết hàng.',
    invoiceNotYours: 'Không tìm thấy hóa đơn của bạn.',
    starsDelivered: '✅ Đã thanh toán và giao hàng.\nĐơn: {id}\nMã/Tài khoản:\n{secret}\nXem lại: /mykey {id}',
    starsAwaitDelivery: '✅ Thanh toán thành công. Đơn {id} đang chờ hỗ trợ giao hàng. Dùng /paysupport.',
    starsAdminAlert: '⚠️ Đơn Stars {id} đã thanh toán nhưng chưa giao được. Kiểm tra kho hàng và /retryalerts.',
    physicalPaidCustomer: '✅ Đã nhận {amount}đ cho đơn {id}. Đơn đang chờ giao hàng.',
    physicalPaidAdmin: '📦 Đơn vật lý đã thanh toán: {id}\nDùng /fulfill {id} sau khi giao.',
    refundDenied: 'Chỉ được hoàn Stars cho đơn PAID chưa giao hàng.',
    refundBadUser: 'Telegram user ID không hợp lệ.',
    refundDuplicate: 'Không được gọi hoàn tiền lặp. Kiểm tra đối soát trước.',
    refundConfirmed: 'Telegram xác nhận hoàn Stars thành công.',
    refundReview: 'Kết quả chưa chắc chắn. Kiểm tra giao dịch Telegram; không gửi yêu cầu hoàn tiền lần hai.'
  },
  en: {
    noProducts: 'No products yet. Please check back later.',
    catalogTitle: '🛍 Product catalog (up to 30 items):',
    buy: '🛒 Buy',
    noOrders: 'No orders yet.',
    physicalUsage: 'Usage: /addphysical Name | Price VND | Description\nor /adddigital Name | Price Stars | Description',
    productCreatedPhysical: 'Created product #{id} (physical)',
    productCreatedDigital: 'Created product #{id} (digital — Stars)',
    keyUsage: 'Usage: /addkey ID | Key/account value',
    digitalNotFound: 'Digital product not found.',
    keyAdded: 'Added 1 key to product #{id}',
    adminHelp: 'Admin commands:\n/addphysical Name | VND | Description\n/adddigital Name | Stars | Description\n/addkey ID | Key\n/adminorders\n/expireorders\n/bankreviews\n/ackbank TRANSACTION_ID\n/refundstars ORDER_ID\n/refundreviews\n/retryalerts\n/fulfill ORDER_ID',
    expiredReport: 'Expired {expired} orders and released {keys} keys. Approved pre-checkouts remain reserved.',
    bankReviews: 'Bank transfers requiring review (no automatic credit):\n{rows}',
    noBankReviews: 'No bank transfers awaiting review.',
    bankReviewed: 'Marked transfer {id} reviewed. This does not issue a refund or credit.',
    noBankReview: 'No matching transfer awaiting review.',
    refundReviews: 'Stars refunds requiring Telegram verification:\n{rows}',
    noRefundReviews: 'No Stars refunds awaiting verification.',
    refundResponse: 'Stars refund: {status}\n{detail}',
    retrySent: '✅ Retried {count} pending notifications. Run again if needed.',
    retryFailed: '⚠️ Notification retry failed. Check logs and retry /retryalerts later.',
    noPhysicalPaid: 'No paid physical orders awaiting fulfillment.',
    physicalFulfilledNotice: '✅ Admin marked order {id} fulfilled.',
    physicalFulfilled: 'Completed {id}',
    invalidAdmin: 'Invalid admin command. Use /admin.',
    invalidCheckout: 'This order is invalid or already paid. Please place a new order.',
    welcome: '👋 Welcome to ePlus Telegram Sales Bot!\n/catalog — Products\n/orders — Orders\n/invoice ORDER_ID — Stars invoice\n/language — Language\n/help — Help',
    help: 'Commands: /catalog, /orders, /invoice ORDER_ID, /mykey ORDER_ID, /language, /paysupport.\nDigital goods use Telegram Stars. Physical goods use bank QR and SePay.',
    keyFound: '🔑 Key for order {id}:\n{secret}',
    keyMissing: 'No key available for your account and order.',
    support: 'Payment support: {contact}',
    supportAdmin: 'Contact the store admin.',
    unknownCommand: 'Use /catalog to browse or /help for support.',
    languagePrompt: '🌐 Choose a language / Chọn ngôn ngữ:',
    languageSaved: '✅ Language set to English.',
    invalidLanguage: 'Unsupported language. Use /lang vi or /lang en.',
    physicalExpired: 'Order {id} has expired. Do not transfer money; contact support if you already paid.',
    physicalAlready: 'Order {id} is {status}. Do not transfer money again; check /orders or contact support.',
    physicalReceipt: 'Order {id}\nProduct: {name}\nAmount: {amount} VND\nBank BIN: {bin}\nAccount: {account}\nRequired transfer memo: {id}\nQR: {qr}\nSend the exact amount and memo. SePay will confirm the transfer.',
    invoiceExpired: 'Order {id} has expired. Please place a new Stars order.',
    invoiceAlready: 'Order {id} has been processed ({status}). Check /orders or /mykey {id}',
    invoiceMissing: 'Invoice not found. Please contact support.',
    invoiceCreating: '⏳ Creating invoice for {id}. Use /invoice {id} to retrieve the link shortly.',
    invoicePay: '⭐ Order {id}\n{name} · {stars} Stars\nUse the button below to pay. Retrieve: /invoice {id}',
    invoiceButton: '⭐ Pay with Stars',
    orderMissing: 'Order not found. Please contact support.',
    invalidPurchase: 'Invalid purchase request.',
    mismatchedPurchase: 'Purchase request details do not match.',
    productMissing: 'Product not found.',
    bankNotConfigured: 'Bank transfer is not configured.',
    productUnavailable: 'Product is not available.',
    stockEmpty: 'Out of stock.',
    invoiceNotYours: 'No invoice found for your account.',
    starsDelivered: '✅ Payment confirmed and delivered.\nOrder: {id}\nKey/account:\n{secret}\nRetrieve: /mykey {id}',
    starsAwaitDelivery: '✅ Payment successful. Order {id} needs manual delivery support. Use /paysupport.',
    starsAdminAlert: '⚠️ Paid Stars order {id} cannot be delivered. Check inventory and /retryalerts.',
    physicalPaidCustomer: '✅ Received {amount} VND for order {id}. Awaiting fulfillment.',
    physicalPaidAdmin: '📦 Paid physical order: {id}\nUse /fulfill {id} after shipping.',
    refundDenied: 'Only paid but undelivered Stars orders can be refunded here.',
    refundBadUser: 'Invalid Telegram user ID.',
    refundDuplicate: 'Refund request already exists. Verify settlement before retrying.',
    refundConfirmed: 'Telegram confirmed the Stars refund.',
    refundReview: 'The result is uncertain. Verify with Telegram; do not issue a second refund request.'
  }
};

export const AVAILABLE_LANGUAGES = Object.freeze(['vi','en']);

export function normalizeLanguage(value) {
  const prefix=String(value||'').trim().toLowerCase().split(/[-_]/)[0];
  return prefix==='vi'?'vi':prefix==='en'?'en':null;
}

export function t(language,key,values={}) {
  const lang=normalizeLanguage(language)||'vi';
  const phrase=catalog[lang][key]??catalog.vi[key];
  if (typeof phrase!=='string')throw new Error('Missing translation: '+key);
  return phrase.replace(/\{([a-z]+)\}/g,(match,k)=>
    Object.hasOwn(values,k)?String(values[k]):match);
}

export function money(language,amount) {
  return Number(amount||0).toLocaleString(normalizeLanguage(language)==='en'?'en-US':'vi-VN');
}

export async function languageFor(env,person) {
  const id=person?.id;
  if(id===undefined||id===null)return 'vi';
  const userId=String(id);
  const row=await env.DB.prepare('SELECT locale,source FROM user_locales WHERE user_id=?')
    .bind(userId).first();
  if(row?.source==='manual')return row.locale;
  const detected=normalizeLanguage(person?.language_code);
  const desired=detected||row?.locale||'vi';
  if(!row || row.locale!==desired) {
    await env.DB.prepare(
      "INSERT INTO user_locales(user_id,locale,source) VALUES(?,?,'auto') "
      + "ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,updated_at=CURRENT_TIMESTAMP "
      + "WHERE user_locales.source='auto'"
    ).bind(userId,desired).run();
  }
  return desired;
}

export async function languageForId(env,userId) {
  if(userId===null||userId===undefined)return 'vi';
  const row=await env.DB.prepare('SELECT locale FROM user_locales WHERE user_id=?')
    .bind(String(userId)).first();
  return normalizeLanguage(row?.locale)||'vi';
}

export async function setLanguage(env,userId,language) {
  const locale=normalizeLanguage(language);
  if(!locale)return null;
  await env.DB.prepare(
    "INSERT INTO user_locales(user_id,locale,source) VALUES(?,?,'manual') "
    + "ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale,source='manual',updated_at=CURRENT_TIMESTAMP"
  ).bind(String(userId),locale).run();
  return locale;
}

// Admin UI stores only this non-sensitive preference in a Secure cookie.
export function adminLanguage(request) {
  const query=new URL(request.url).searchParams.get('lang');
  const cookie=String(request.headers.get('cookie')||'')
    .split(';').map(x=>x.trim()).find(x=>x.startsWith('eplus_admin_lang='));
  return normalizeLanguage(query)||normalizeLanguage(cookie?.slice('eplus_admin_lang='.length))||'vi';
}
