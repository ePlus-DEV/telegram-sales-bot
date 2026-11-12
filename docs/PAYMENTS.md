# Payments, settlement and safety

[← Docs](README.md) · [Configuration](CONFIGURATION.md) · [Commands](COMMANDS.md) · [Operations](OPERATIONS.md)

> **Payment-policy boundary:** Telegram requires **Stars (XTR)** for digital goods/services sold inside Telegram. This code uses **VietQR + SePay only for eligible physical goods**; adding payOS/MoMo/VNPay for other scenarios is planned, not implemented. Official references: [Telegram Stars](https://core.telegram.org/bots/payments-stars), [Bot API](https://core.telegram.org/bots/api).

## Digital goods — Telegram Stars

1. The buyer selects a digital product. The bot reserves a key in D1/Turso and stores one order per Telegram Buy callback.
2. The bot creates and persists a Stars invoice link. `/invoice ORDER_ID` recovers **that user's** existing link.
3. Telegram sends a `pre_checkout_query`. Only one unique checkout-query ID is approved per order; Telegram must receive an answer within **10 seconds**.
4. **Do not deliver on pre-checkout approval alone**. Wait for a legitimate `successful_payment` update.
5. After checking the payment's charge ID, order ID, buyer and Stars amount, the app settles the order, marks a reserved key delivered, and queues the customer notification.
6. `/mykey ORDER_ID` allows only the original buyer to retrieve a key already delivered to that order.

**Safe expiry:** an *unapproved* Stars order may expire (default **24h**) and release its reservation. A previously approved checkout is **not** automatically released, because the charge may arrive after a delay. Operators must manually reconcile such abandoned approvals. See [Roadmap P0](../ROADMAP.md).

**Late payment or missing key:** record the paid event, avoid reusing inventory and direct the order for review; never silently discard confirmed payment.

## Physical goods — VietQR and SePay

1. Buyer selects a physical product. The bot creates a random order memo and displays a VietQR URL containing recipient account, exact VND amount and required transfer content.
2. SePay sends an authenticated incoming-transfer webhook to `/sepay/webhook`.
3. The server checks API-key authentication, recipient bank account, incoming direction, exact amount, and matching order memo; its event ledger prevents applying a transaction twice.
4. A valid payment marks a matching active order **PAID**, queues customer/admin notifications and awaits manual fulfillment.
5. The admin confirms actual shipment/delivery, then uses `/fulfill ORDER_ID` or the Web Admin order action.

**Exceptions:** Wrong amount, unknown order, already-paid order or transfer after an order expired are recorded for manual review (`/bankreviews`, `/ackbank TRANSACTION_ID`). **Acknowledging a review does not credit another order or issue a refund.** A bank refund must be handled through the actual bank/provider.

Default physical-order expiry is **30 minutes**, configurable via `PHYSICAL_ORDER_TTL_MINUTES`. An expired order must not keep instructing customers to transfer funds.

## Notifications and webhook retries

The `notification_outbox` table keeps intents for paid-order messages. Replayed legitimate payment webhooks and the Cloudflare cron can retry pending notifications, and the admin can use `/retryalerts` on any host. Database order settlement and stock allocation are designed to be idempotent.

**Telegram `sendMessage` has no idempotency key.** If the network/process fails after Telegram accepts a message but before the database records its delivery, **the notification can be repeated**. Do not interpret duplicate messages as additional charges; inspect the ledger.

## Stars refunds

Admin `/refundstars ORDER_ID` is limited to a **PAID, undelivered digital order**. The app records a one-shot refund intent, then calls Telegram `refundStarPayment` using the original charge ID. A confirmed return is recorded as `CONFIRMED`. Any unknown/error outcome becomes `NEEDS_REVIEW` (or `CALLING` if interrupted) and **must not be blindly retried**.

Use `/refundreviews` and Telegram transaction records to reconcile. Refunds of fulfilled goods and complex disputes are **not** automatically handled. The code does not issue bank refunds.

## Minimum staging test matrix

| Case | Expected result |
| --- | --- |
| Duplicate Buy callback | One order and one inventory reservation |
| Invoice-link creation timeout | Recoverable link/order without creating a second order |
| Duplicate Stars pre-checkout query | Same query can be handled again; second distinct query for one order rejected |
| Stars successful payment | Exactly one key assigned; customer can use `/mykey` |
| Stars payment notification failure | Paid status preserved; outbox can retry safely |
| Expired **unapproved** Stars order | Key released, new checkout refused on expired order |
| Old **approved** Stars checkout | Key stays reserved pending reconciliation |
| SePay valid transfer | Correct physical order marked PAID, fulfillment manual |
| SePay mismatch/unknown/late credit | Review record; no automatic credit to another order |
| Duplicate SePay event | No duplicate settlement |
| Unknown Stars refund API result | `NEEDS_REVIEW`; no automated second refund call |
| Unauthorized admin / bad CSRF | Operation rejected |

The automated test suite covers portions of this matrix. **A full live-provider/staging evidence set is still required** before production.

## Related documentation

- [Commands](COMMANDS.md) — buyer/admin recovery actions
- [Operations](OPERATIONS.md) — logs, backups, incident response
- [Roadmap](../ROADMAP.md) — remaining release gates
