-- Preview migration 004: publication calendar and dispatch batch model.
BEGIN;
CREATE TABLE IF NOT EXISTS issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issue_code text NOT NULL UNIQUE,
 title text NOT NULL,
 publication_date date,
 entitlement_cutoff_at timestamptz NOT NULL,
 publication_status text NOT NULL DEFAULT 'scheduled' CHECK(publication_status IN ('draft','scheduled','published','cancelled')),
 regular_available boolean NOT NULL DEFAULT true,
 pocket_available boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issue_calendar_idx ON issues(entitlement_cutoff_at,publication_status);
CREATE TABLE IF NOT EXISTS dispatch_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issue_id uuid NOT NULL REFERENCES issues(id),
 format text NOT NULL CHECK(format IN ('regular','pocket')),
 batch_code text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','exported','closed')),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 exported_at timestamptz,
 closed_at timestamptz
);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES dispatch_batches(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS replacement_for uuid REFERENCES dispatches(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS exception_reason text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS address_version integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS address_snapshot_version integer NOT NULL DEFAULT 1;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processed_at timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS entitlement_processing_error text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider_event_id text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_provider_event_uq ON webhook_events(provider,provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_retry_idx ON webhook_events(processing_status,next_attempt_at);
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES issues(id);
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
