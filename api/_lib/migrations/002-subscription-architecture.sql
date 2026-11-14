-- Migration 002: subscription architecture gaps (Preview DB only)
-- Apply after 001 subscription-schema.sql. Transactional and safe to rerun.

BEGIN;

-- Plan versioning: immutable contract price/version references.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now();
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS retired_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_code_version_uq
  ON subscription_plans(code, version);

-- Freeze plan contract on subscription; existing rows resolve to current code/version 1.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz;
-- Base schema already includes checkout_idempotency_key; keep this migration idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_checkout_idempotency_uq
  ON subscriptions(checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL;

-- Explicit issue calendar, with separate physical format availability.
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_code text NOT NULL UNIQUE,
  title text,
  release_at timestamptz,
  entitlement_cutoff_at timestamptz,
  dispatch_from timestamptz,
  regular_available boolean NOT NULL DEFAULT true,
  pocket_available boolean NOT NULL DEFAULT false,
  publication_status text NOT NULL DEFAULT 'planned'
    CHECK (publication_status IN ('planned','published','closed','cancelled')),
  regular_print_quantity integer CHECK (regular_print_quantity IS NULL OR regular_print_quantity >= 0),
  pocket_print_quantity integer CHECK (pocket_print_quantity IS NULL OR pocket_print_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issues_release_idx ON issues(release_at,publication_status);

-- Payment period/source and explicit entitlement provenance.
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS refunded_paise integer NOT NULL DEFAULT 0
  CHECK (refunded_paise >= 0);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES issues(id);
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS billing_period_start timestamptz;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS billing_period_end timestamptz;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS entitlement_reason text;
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'system';
ALTER TABLE issue_entitlements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Issue/format uniqueness prevents multiple subscriptions from producing duplicates only if
-- policy says one subscriber receives one copy; retain subscription uniqueness as the base invariant.
CREATE INDEX IF NOT EXISTS entitlements_customer_issue_idx
  ON issue_entitlements(customer_id,issue_code,format);

-- Dispatch batches make print/courier quantities auditable and exportable.
CREATE TABLE IF NOT EXISTS dispatch_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id),
  format text NOT NULL CHECK (format IN ('regular','pocket')),
  batch_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','locked','exported','completed','cancelled')),
  locked_at timestamptz,
  exported_at timestamptz,
  created_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES dispatch_batches(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS original_dispatch_id uuid REFERENCES dispatches(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS exception_reason text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS courier_exported_at timestamptz;
CREATE INDEX IF NOT EXISTS dispatch_batch_idx ON dispatches(batch_id);
CREATE INDEX IF NOT EXISTS dispatch_original_idx ON dispatches(original_dispatch_id);

-- Durable email queue; senders can safely retry on unique key.
CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  recipient text NOT NULL,
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox(status,scheduled_at);

-- Stronger webhook event bookkeeping and safe replay.
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS provider_event_id text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_provider_event_id_uq
  ON webhook_events(provider,provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_events_retry_idx ON webhook_events(processing_status,next_attempt_at);

-- Customer/address lifecycle.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS normalized_email text;
UPDATE customers SET normalized_email=lower(trim(email)) WHERE normalized_email IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_normalized_email_uq ON customers(normalized_email);
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Subscription lifecycle allows provider terminology and local mapped statuses.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired'));

COMMIT;
