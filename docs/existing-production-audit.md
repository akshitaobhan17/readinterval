# The Interval — existing production code audit
**Audited:** GitHub `main`, 14 November 2026  
**Scope:** Repository source only. Vercel runtime settings, secret values, live database/data, and live Razorpay account configuration are not directly verified here.

## Repository inventory
Static site: `index.html`, `about.html`, `buy.html`, `styles.css`, `checkout.css`, `site.js`.  
Admin UI: `admin/orders.html`.  
Serverless API: `admin-orders.js`, `create-order.js`, `deliver-order.js`, `manual-order-email.js`, `manual-orders.js`, `razorpay-config.js`, `razorpay-webhook.js`, `ship-order.js`, `verify-payment.js`.  
Config: `.env.example`, `package.json`, `vercel.json`. No application database or test suite appears in the main-branch tree.

## Verified current behaviour

### Customer purchase
- `buy.html` offers one-off issues, Pocket copies and bundles; loads Razorpay Checkout.js in browser.
- `api/create-order.js` contains a hard-coded product/amount allowlist and creates Razorpay Orders. Customer name/email/phone/address are put in order notes.
- `api/razorpay-config.js` returns the public Razorpay key ID.
- `api/verify-payment.js` verifies checkout HMAC and fetches payment/order from Razorpay; this is not a subscription activation flow or durable local order ledger.
- `api/razorpay-webhook.js` validates HMAC against raw request body and only processes `order.paid`; confirmation email idempotency marker is stored by editing order notes. No event ID ledger or subscription lifecycle processing.

### Admin, manual/gift and shipping
- `admin/orders.html` uses an admin key entered in the browser and stores it in localStorage; calls APIs with `x-admin-key`. It loads paid Razorpay orders and manual Blob orders.
- `api/admin-orders.js` retrieves only the first 100 Razorpay orders; it filters paid Interval orders by `product_key` in notes. No pagination/search/reconciliation.
- `api/manual-orders.js` stores the complete manual/gift order list as one private Blob JSON file. It supports GET/POST/PATCH and duplicate ID checking, but whole-file read/modify/write is vulnerable to concurrent-write lost updates; no immutable audit log.
- `api/manual-order-email.js` sends manual gift email but does not persist a sent marker, so repeated calls can send duplicates.
- `api/ship-order.js` requires paid Interval order, tracking number and email; sends shipping email and writes shipping status/tracking email timestamp to Razorpay notes. Tracking email guard exists but mail-send then note-write is a non-atomic sequence.
- `api/deliver-order.js` requires shipped status and avoids repeat delivery email via note marker; same send/write non-atomicity.
- Manual orders have status/tracking but no equivalent transactional shipping-email outbox.

### Security/config/deployment observations
- `INTERVAL_ADMIN_KEY` is a shared static bearer secret; admin page stores it in browser localStorage. No session, role separation, CSRF token or rate limiting is visible in these files. Treat as high-priority hardening before broader admin features.
- `.env.example` lists Razorpay keys and Resend values only; no DB config.
- `package.json` has Razorpay and Vercel Blob dependencies; no test script or test framework.
- `vercel.json` only sets clean URLs and trailing slash behaviour.
- Do not expose or commit real secret values. Existing order records in Razorpay/Blob are external data and require a backup/export plan before migration.

## Subscription rebuild implications
- Keep current paid-order/manual-gift flows available during transition; don't simply delete old API routes or notes.
- New recurring system needs separate DB-backed customers, addresses/address snapshots, subscription records, payment ledger, webhook inbox/event deduplication, issue catalog, entitlement ledger, dispatch/replacement ledger, email outbox and admin audit.
- Razorpay webhook handling should verify raw-body signature, durably record event before processing, deduplicate, tolerate retries/out-of-order arrival, and make state transitions transactional/idempotent.
- Subscription payments and physical dispatch must remain separate. Unique entitlement/dispatch keys and address snapshots are required.
- Migrate admin authentication away from browser-localStorage shared key to server-side authenticated session/strong admin auth before customer-facing admin expansion.
- Manual/gift order Blob path should be retained short-term; plan a safe migration or leave a supported, audited parallel workflow. Do not treat Blob JSON as subscription database.

## Audit gaps (not verifiable from repository source alone)
- Vercel project access settings, environment target values and actual secret presence (names only previously checked).
- Razorpay dashboard plan IDs, subscription/webhook configuration, live/test mode, account state.
- Resend domain verification, delivery logs and sender configuration.
- Current contents/backup of Blob manual-order data and Razorpay order history.
- Actual production deployment behaviour, logs, uptime, function limits and access policy.
- Current customer/order data quality and fulfilment backlog.

## Gate
This audit is code inspection, not a security penetration test, runtime test or proof of production configuration. No production code/deployment changed as part of this audit.
