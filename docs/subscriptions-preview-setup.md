# Preview subscription setup checklist

This is deliberately a preview-only runbook. No live subscriptions are enabled by these commits.

## 1. Provision isolated Postgres
- Create a Neon project/database for Preview (separate from production).
- Store its pooled connection string as `DATABASE_URL` in Vercel Preview environment only.
- Do not paste credentials into GitHub or chat.
- Apply `api/_lib/subscription-schema.sql`, then `api/_lib/seed-subscription-plans.sql`.
- Verify six plan rows and constraints; run migrations against a disposable DB first.

## 2. Razorpay test mode
- Create six recurring plans in Razorpay **Test Mode**, matching the canonical catalogue amounts/cadences.
- Add their plan IDs as Preview-only environment variables:
  `RAZORPAY_PLAN_REGULAR_MONTHLY`, `RAZORPAY_PLAN_REGULAR_QUARTERLY`,
  `RAZORPAY_PLAN_REGULAR_ANNUAL`, `RAZORPAY_PLAN_POCKET_MONTHLY`,
  `RAZORPAY_PLAN_POCKET_QUARTERLY`, `RAZORPAY_PLAN_POCKET_ANNUAL`.
- Use test keys only for Preview. Do not use live plan IDs/keys during development.

## 3. Webhook
- Configure the Preview webhook endpoint once implemented; use a separate test secret.
- Subscribe only to events implemented and verified in the handler.
- Test signature validation, event replay/deduplication, out-of-order delivery and retries.

## 4. Validation gates before production
- Unit/integration tests for plan validation, idempotency, billing states, entitlement allocation and fulfilment.
- End-to-end checkout, failed payment/recovery, cancel/resubscribe, address update, and shipment/tracking email.
- Reconcile local records against Razorpay test data.
- Review preview deployment and approve explicitly before production rollout.
