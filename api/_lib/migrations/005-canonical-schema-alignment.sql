-- Migration 005: align handler assumptions with canonical 001-002 schema.
-- Preview database only; apply after migrations 001-004.
BEGIN;
-- Issue calendar canonical columns (migration 002 uses release_at and planned/published/closed).
ALTER TABLE issues ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS publication_date date;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS entitlement_cutoff_at timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dispatch_from timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS publication_status text;
UPDATE issues SET entitlement_cutoff_at=COALESCE(entitlement_cutoff_at,release_at,now()),
 publication_status=CASE WHEN publication_status IN ('planned','published','closed','cancelled') THEN publication_status ELSE 'planned' END;
ALTER TABLE issues ALTER COLUMN entitlement_cutoff_at SET NOT NULL;
ALTER TABLE issues ALTER COLUMN publication_status SET DEFAULT 'planned';
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_publication_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_publication_status_check CHECK(publication_status IN ('planned','published','closed','cancelled'));
-- Dispatch batch status vocabulary matches handler.
ALTER TABLE dispatch_batches DROP CONSTRAINT IF EXISTS dispatch_batches_status_check;
ALTER TABLE dispatch_batches ADD CONSTRAINT dispatch_batches_status_check CHECK(status IN ('draft','locked','exported','completed','cancelled'));
-- Dispatch lifecycle extras used by admin tools.
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS courier text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS replacement_for uuid REFERENCES dispatches(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS exception_reason text;
-- Stable plan code/version and normalized customer lookup.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS normalized_email text;
UPDATE customers SET normalized_email=lower(trim(email)) WHERE normalized_email IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_normalized_email_uq ON customers(normalized_email);
-- Webhook processor uniqueness and retry metadata.
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider_event_id text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_provider_event_uq ON webhook_events(provider,provider_event_id) WHERE provider_event_id IS NOT NULL;
-- Payment ledger period fields and processing tracking.
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processed_at timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processing_error text;
CREATE TABLE IF NOT EXISTS entitlement_processing_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_id uuid NOT NULL UNIQUE REFERENCES subscription_payments(id),
 status text NOT NULL CHECK(status IN ('processing','completed','failed')),issue_codes text[] NOT NULL DEFAULT '{}',
 error text,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
);
COMMIT;
