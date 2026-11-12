# Telegram commands and Web Admin

[← Docs](README.md) · [Getting started](GETTING_STARTED.md) · [Payments](PAYMENTS.md)

**Telegram bot commands** work in private chat. The separate web dashboard lives at **`https://YOUR_HOST.example/admin`** and requires `ADMIN_DASHBOARD_PASSWORD`. These are two different admin interfaces.

## Customer commands

| Command | What it does |
| --- | --- |
| `/start` | Welcome and navigation |
| `/help` | Help, including payment rules |
| `/catalog` or `/products` | Browse the first 30 active products with Buy buttons |
| `/orders` | Show the user's most recent 10 orders |
| `/invoice ORDER_ID` | Retrieve the same pending Stars invoice link, for **your own order** |
| `/mykey ORDER_ID` | Reopen a digital key attached to **your own fulfilled order** |
| `/paysupport` | Contact configured shop support/admin |
| `/language` or `/lang` | Show Vietnamese/English selection |
| `/lang vi`, `/lang en` | Save preferred language; overrides Telegram auto-detection |

An unsupported Telegram language falls back to Vietnamese. Product names and descriptions are not translated automatically.

## Telegram admin commands

Only the configured numeric `ADMIN_TELEGRAM_ID` may invoke these commands.

| Command | Action | Safety note |
| --- | --- | --- |
| `/admin` | List admin commands | This **does not** open the website dashboard |
| `/addphysical Name \| VND \| Description` | Create a physical product | VietQR/SePay only |
| `/adddigital Name \| Stars \| Description` | Create a digital product | Must use Telegram Stars |
| `/addkey PRODUCT_ID \| KEY` | Add one digital key | Do not paste sensitive credentials into group chat |
| `/adminorders` | View 10 latest orders | Admin-only |
| `/fulfill ORDER_ID` | Mark an already-PAID physical order fulfilled | Does not physically ship or refund |
| `/expireorders` | Expire eligible unapproved orders | Never releases an approved Stars reservation |
| `/retryalerts` | Retry up to 20 pending notifications | A message may be delivered twice after a crash |
| `/bankreviews` | Review unmatched/late/incorrect SePay transfers | No automatic credit |
| `/ackbank TRANSACTION_ID` | Record that a transfer was manually reviewed | Does not refund money |
| `/refundreviews` | List unresolved Stars refund states | Verify with Telegram |
| `/refundstars ORDER_ID` | Request **one** Stars refund for a paid, undelivered digital order | An uncertain result requires manual investigation; no blind retry |

Use **real order IDs only** when operating a test shop. Do not run a refund command on live transactions without a documented review.

## Web Admin (`/admin` URL)

| Section | Available |
| --- | --- |
| Overview | Counts of active products, paid physical orders waiting for fulfillment, available keys and bank reviews |
| Products | Create, update and disable products |
| Inventory | Add keys individually; raw key contents are not shown afterward |
| Orders | See recent 50 orders; mark paid physical orders complete |
| Reconciliation | Acknowledge bank reviews; see unresolved Stars refunds without reissuing the refund API |

Login uses an eight-hour server-side session with Secure/HttpOnly/SameSite=Strict cookies, Origin/CSRF checks and throttled password attempts. The interface supports Vietnamese/English. **No SSO, RBAC, export, bulk import, full dashboard analytics or refund action is available yet.**

Read [Security](../SECURITY.md) before exposing the dashboard to external users.
