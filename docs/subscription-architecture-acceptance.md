# The Interval subscription platform — architecture & acceptance specification
**Status:** Preview branch design baseline; not production implementation or launch approval.

## 0. Catalogue
Regular confirmed: Monthly ₹449/1 issue; Quarterly ₹1,200/3 issues (₹400 each); Annual ₹4,500/12 issues (₹375 each). Pocket monthly/quarterly/annual exists as product variants but price is TBD: do not enable Pocket checkout until price and billing totals are confirmed. Pocket uses same clue/content source but fewer games and smaller physical format. Money is integer paise; display per-issue effective price and recurring charge/frequency.

## 1. System boundaries
- Razorpay: mandate, provider subscription state, recurring billing/invoices/payments/retries.
- Postgres (Neon Preview first): authoritative app/customer/address/subscription/payment/event/issue/entitlement/dispatch/outbox/audit records. Provider IDs uniquely map to local rows. Never use Razorpay notes or one Blob JSON as subscription truth.
- Vercel functions: validated, authenticated, idempotent APIs and jobs.
- Resend: delivery only; outbox tracks intents, retries and provider IDs.
- Legacy: one-time Razorpay orders and Blob manual/gift orders remain supported during transition; preserve history and backup before migration.

## 2. Required data model and invariants
1. customers: UUID, normalized unique email, name/phone/timestamps; retain identity/history on resubscribe.
2. addresses: customer FK, recipient/address/PIN/country/phone, default/archive; preserve address history.
3. plans: code/version, format, cadence, issue count, amount paise/currency, Razorpay plan ID, active. Price changes create new plan version; don't silently change active contracts.
4. issues: stable issue code, publication/cutoff, format availability and print metadata.
5. subscriptions: local UUID/customer/immutable plan version/unique Razorpay ID/status/start-period-next charge/cancel intent/address reference and lifecycle timestamps.
6. subscription_payments: unique provider payment/invoice IDs, subscription, amount/currency/status/period/failure/refund/raw safe metadata.
7. webhook_events: provider+event ID unique, type/payload/received-processed timestamps/attempts/state/error. Persist verified event before processing; reject invalid signature.
8. entitlements: subscription/customer/issue+format/quantity/source billing period/payment/state/reason/time. Unique subscription+issue+format.
9. dispatches: entitlement, immutable parcel address snapshot, quantity/courier/tracking/status/timestamps. Replacement links to original dispatch; does not create a second entitlement.
10. email_outbox: unique idempotency key, recipient/template/payload/status/attempts/provider message ID/sent/error.
11. admin_audit_log: actor/action/entity/details/timestamp; audit sensitive overrides and admin changes.

Invariants: provider IDs unique; no duplicate payments/entitlements/dispatch/email; money in paise; payment and dispatch are separate; all overrides audited.

## 3. Lifecycle and webhook handling
- Create subscriptions only from server-authoritative plans; validate customer/address; use checkout idempotency key.
- Handle provider-created/local-DB-failed cases with reconciliation/compensation.
- Browser redirect is never proof of activation/payment; use webhook or server verification.
- Verify Razorpay signature on exact raw body and server-only webhook secret.
- Event inbox unique by provider event ID; duplicate delivery is harmless. Durably record before acknowledging; retry processing.
- Support authenticated/activated/charged/pending/halted/cancelled/paused/resumed/completed/expired plus payment failure/refund events after confirming current Razorpay event names.
- Handle delayed/out-of-order events with provider fetch/reconciliation and transition rules, not arrival-order overwrites.
- Transactionally update state/payment and enqueue email/entitlement work; failures remain retryable.
- Reconciliation compares provider and local state and reports discrepancies; never silently infer paid.

## 4. Entitlement engine (pure/testable + transactional)
Inputs: plan version, lifecycle, paid billing period/payment, issue schedule/cutoffs, start/cancel date and format. Output: eligible/held issue records with reason, idempotently keyed.
Proposed rules pending user decisions:
- Issue calendar/cutoffs explicit; no calendar-month guessing.
- Mid-cycle start: specify next eligible issue/cutoff and disclose at checkout; no implicit prorating.
- Monthly/quarterly/annual paid cycles allocate exactly 1/3/12 issue codes.
- Period-end cancellation stops future renewal but preserves paid/earned issues. Immediate cancellation/refund is an audited exception.
- Failed charge: no unpaid entitlement; grace/retry policy applies; hold dispatch while unresolved unless audited exception.
- Recovery reconciles invoice and creates only missing entitlements.
- Address changes apply to future dispatches; existing parcel snapshot remains fixed. Recommended snapshot at dispatch batch lock.
- Plan change no automatic proration/credit until approved; safer effective-next-cycle approach.
- Resubscribe creates a new subscription row/provider ID linked to same customer/history.
- Pause/resume rules must be defined before portal enablement.

## 5. API surface
Public: GET subscription plans (Pocket omitted while TBD); POST checkout (idempotent); authenticated customer portal/detail/payment/entitlement; POST cancel/change-plan/update-address/recover with ownership checks and audit.
Provider: POST subscription webhook (raw signature, durable inbox, idempotent processor).
Admin: subscriber search/detail; lifecycle/payment/reconciliation; issues/entitlement generation; dispatch batch/export; tracking/shipping/replacement/return; manual/gift; CSV; metrics/audit.
Jobs: webhook processor, outbox sender, provider reconciliation, renewal/failure alerts, entitlement run and dispatch export; each needs locks/idempotency/logging.

## 6. Customer/admin experience
- Checkout states format, issue count, effective per-issue cost, charge total/frequency, mandate authorization and renewal/cancellation terms.
- Confirmation distinguishes mandate authorization from first charge; shows confirmed status/next charge and issue expectation.
- Portal: status/plan/next renewal/payment history/entitlements/address/cancel date; recovery and resubscribe.
- Cancellation explains effective date and already-paid issues.
- Admin metrics: subscribers by status/format/cadence; define MRR separately from collections/refunds; renewals/failures/dispatch/tracking; search by name/email/phone/subscription/payment/order/tracking; CSV.
- Admin overrides require reason and audit.

## 7. Fulfilment
Configure issue/cutoff; run idempotent entitlement preview by Regular/Pocket; review held exceptions; lock dispatch batch and snapshot address; courier CSV; tracking update and outbox shipping email; record delivery/return/undelivered/replacement separately; reconcile print quantities to dispatch and manual/gift allocations.

## 8. Security and operations
Replace static browser-localStorage admin key with secure session/auth + roles; CSRF protection, rate limits, input validation, escaped output. Secrets never enter browser/Git/logs. Preview DB/provider isolated. Versioned reviewed migrations, backup/restore before migration. Structured logs/request IDs; alert webhook failures, reconciliation mismatch, stuck outbox, invalid address and dispatch backlog. Confirm privacy/retention/export policy.

## 9. Acceptance test matrix
Checkout: valid/invalid/disabled plan, bad address, repeat click, idempotency, provider timeout, DB failure after provider create, abandoned, mandate pending/success/failure, browser closed after payment.
Webhooks: valid/invalid signature, duplicate, delayed/out-of-order/concurrent, unknown event, DB outage, partial processing retry.
Billing: success/failure/retry/halted/recovery/refund/cancel period-end/admin immediate exception/completed/expired/provider mismatch.
Entitlements: mid-cycle/cutoff, monthly-quarterly-annual counts, Pocket mapping, cancellation after paid cycle, unpaid hold, recovery once, resubscription, plan transition.
Address/fulfilment: before/after batch update, invalid PIN, immutable snapshot, duplicate run, counts/CSV, tracking correction audit, duplicate email, returned parcel/replacement, manual gift compatibility.
Portal/admin: ownership/auth/token expiry/search/pagination/export/audit/cancellation/plan change/metrics.
Reliability: backup/restore, migration rollback, replay, outbox retry, reconciliation and preview smoke tests.
Release gates: green unit/integration tests; Razorpay Test Mode E2E; isolated Preview credentials; webhook/replay/reconciliation; UX/CSV review; rollback and backup; explicit approval before Production/live billing.

## 10. Decisions not to guess
Pocket prices; issue calendar/cutoff and mid-cycle allocation; cancellation/refund policy; failed-payment grace/retry and dispatch hold; plan/format change and proration; pause availability; customer auth (magic link/password); shipping SLA/returns/support; Pocket/Regular cadence (same dates only provisional).

## 11. Implementation sequence
A. Review schema + lock business rules. B. Provision isolated Preview DB/migrations; seed Regular only. C. Razorpay plans/checkout/webhook/payment ledger. D. Entitlement engine/tests. E. Dispatch/outbox/CSV. F. Secure admin/portal. G. Reconciliation/failure drills. H. Preview QA; production only after explicit approval.

**Existing preview schema is draft:** missing issues and email_outbox, plan versioning, replacement linkage, entitlement period/source and complete lifecycle constraints. Revise before applying.