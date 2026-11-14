-- Migration 003: paid-period entitlement ledger. Preview DB only.
BEGIN;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_plan_version integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS customer_reference text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS provider_invoice_status text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processed_at timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processing_error text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS provider_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_invoice_uq ON subscription_payments(razorpay_invoice_id) WHERE razorpay_invoice_id IS NOT NULL;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS entitlement_reason text;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'system';
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS entitlements_payment_idx ON issue_entitlements(payment_id);
CREATE TABLE IF NOT EXISTS entitlement_processing_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL UNIQUE REFERENCES subscription_payments(id),
 status text NOT NULL CHECK(status IN ('processing','completed','failed')),
 issue_codes text[] NOT NULL DEFAULT '{}',
 error text,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
COMMIT;
