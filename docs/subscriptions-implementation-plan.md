# The Interval subscriptions — implementation plan

## Current implementation audit (main branch, 14 November 2026)

### Existing purchase/payment flow
- `buy.html` is a one-time purchase page with individual issues, pocket issues, and bundles.
- `api/create-order.js` creates Razorpay Orders (not Subscriptions) and stores customer/delivery data in Razorpay order notes.
- `api/verify-payment.js` validates the checkout signature and fetches the order/payment, but verification does not persist an independent order record.
- `api/razorpay-webhook.js` handles only `order.paid`; it sends a confirmation email and writes an email timestamp into order notes.
- `api/admin-orders.js` reads Razorpay Orders (currently capped at 100) and private Vercel Blob manual orders.
- `api/ship-order.js` writes tracking/shipping status to Razorpay order notes and sends one shipping email.
- Manual/gift orders are stored in `interval/manual-orders.json` in Vercel Blob.
- No subscriber database, recurring-subscription endpoints, subscription webhooks, entitlement ledger, issue fulfilment ledger, reconciliation job, or customer self-service subscription portal was found in the inspected files.
- Existing admin is order/shipping-focused, not subscriber-focused.

## Commercial catalogue (confirmed)
### Regular
- Monthly: ₹449 per issue; ₹449 billed monthly.
- Quarterly: ₹400 per issue; ₹1,200 billed every 3 months.
- Annual: ₹375 per issue; ₹4,500 billed every 12 months.

### Pocket
- Monthly: ₹299 per issue; ₹299 billed monthly.
- Quarterly: ₹266 per issue; ₹798 billed every 3 months.
- Annual: ₹250 per issue; ₹3,000 billed every 12 months.

Pocket contains fewer games, reusing the same clues/content; it is a distinct physical format and subscription product, not an additional duplicate-content upsell.

## Proposed system architecture
1. **Payment provider (Razorpay Subscriptions):** mandate authorisation, recurring charge lifecycle, payment events.
2. **Transactional database (to be provisioned):** authoritative app records for customers, subscription mapping, event deduplication, issue entitlements, dispatches, address history, and admin audit trail. Do not use Razorpay order notes or one JSON Blob as the subscription database.
3. **Webhook processor:** verify raw-body signature; persist event ID before processing; idempotently handle authenticated/activated/charged/pending/halted/cancelled/paused/resumed events; retry safely.
4. **Entitlement engine:** explicit rules for start date, billing period, issue cutoff, cancellation-at-period-end, failed-payment grace/retry, pause, plan change, replacement, and resubscription. Payment and dispatch are separate records.
5. **Fulfilment/admin:** issue-level eligible list; format (Regular/Pocket); address snapshot; dispatch status; tracking; shipment email; replacement/return handling; CSV export; manual/gift order compatibility.
6. **Customer portal:** view plan/status/next charge/payment history, update address, cancel/manage subscription, recover payment issues, and resubscribe.
7. **Reconciliation/monitoring:** compare provider state and local state; alert on discrepancies, stuck events, failed email, or fulfilment exceptions.

## Database entities (initial design)
- customers
- subscriptions (local ID, Razorpay subscription ID, plan/product, status, start/end, next billing, cancellation intent)
- subscription_events (provider event ID unique, type, received/processed timestamps, payload reference)
- payments (provider payment ID unique, subscription ID, amount, currency, status, period)
- issues (issue code, publication date, format)
- entitlements (subscriber, issue, source period/payment, eligibility, status; unique subscriber+issue+format)
- dispatches (entitlement, address snapshot, tracking, shipped/delivered/replacement timestamps)
- addresses (customer, verified/active history)
- admin_audit_log
- email_outbox (idempotency key, delivery status, retries)

## Launch acceptance criteria
- No individual issue/bundle checkout remains in customer-facing navigation or APIs.
- All six subscription plans display exact per-issue and billing totals/frequency.
- Duplicate checkout clicks and webhook deliveries cannot create duplicate subscriptions, payments, entitlements, dispatches, or emails.
- Verified provider events update local state; invalid signatures are rejected.
- Failed, delayed, out-of-order and replayed webhook cases are tested.
- Cancellation stops future billing according to the chosen cancellation policy and does not erase already-earned issue entitlements.
- Plan changes, address changes, resubscription, failed payment recovery and first-period issue allocation have explicit tested rules.
- Admin can search/filter/export subscribers, payment issues and dispatches; manual/gift orders remain supported.
- Shipping email cannot be sent twice accidentally; tracking edits and replacement dispatches are audited.
- Razorpay test-mode end-to-end checks pass; production credentials/webhook secrets are configured only in Vercel environment settings, never committed.
- Preview deployment and rollback are verified before production promotion.

## Decisions still required before live recurring billing
- Database provider/connection and production + preview credentials.
- Exact first issue entitlement and cutoff for a subscription started mid-month.
- Cancellation policy (recommended: cancel at period end; no automatic refund).
- Grace/retry policy and whether dispatch is held during payment recovery.
- Whether customers can switch Regular/Pocket or monthly/quarterly/annual mid-cycle, and proration/credit policy.
- Pocket print/dispatch cadence (same issue release as Regular assumed; confirm).
- Customer account/authentication approach for self-service (email magic link vs account password).
- Shipping SLA and support/contact flow.

**Safety:** implement on `subscriptions-preview`; never merge/deploy production or enable live recurring billing until the acceptance tests and decisions above are complete.
