-- The Interval subscription foundation (PostgreSQL)
-- Apply only to an isolated preview database first. Never run against production without review.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_uq ON customers (lower(email));

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  recipient_name text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  state text,
  postal_code text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'IN',
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_one_default_address
  ON customer_addresses(customer_id) WHERE is_default AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_plans (
  code text PRIMARY KEY,
  format text NOT NULL CHECK (format IN ('regular','pocket')),
  cadence_months smallint NOT NULL CHECK (cadence_months IN (1,3,12)),
  issues_per_period smallint NOT NULL CHECK (issues_per_period IN (1,3,12)),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  razorpay_plan_id text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (issues_per_period = cadence_months)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  plan_code text NOT NULL REFERENCES subscription_plans(code),
  razorpay_subscription_id text NOT NULL UNIQUE,
  checkout_idempotency_key text UNIQUE,
  status text NOT NULL CHECK (status IN ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  start_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_charge_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  address_id uuid REFERENCES customer_addresses(id),
  address_snapshot jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_status_renewal_idx ON subscriptions(status, next_charge_at);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  razorpay_payment_id text UNIQUE,
  razorpay_invoice_id text UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL CHECK (status IN ('created','authorized','captured','failed','refunded')),
  paid_at timestamptz,
  failure_code text,
  failure_description text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_sub_idx ON subscription_payments(subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'razorpay',
  event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processing','processed','failed','ignored')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider,event_id)
);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events(processing_status, received_at);

CREATE TABLE IF NOT EXISTS issue_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  issue_code text NOT NULL,
  format text NOT NULL CHECK (format IN ('regular','pocket')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  payment_id uuid REFERENCES subscription_payments(id),
  entitlement_status text NOT NULL DEFAULT 'eligible' CHECK (entitlement_status IN ('eligible','held','dispatched','cancelled')),
  eligible_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,issue_code)
);
CREATE INDEX IF NOT EXISTS entitlements_issue_status_idx ON issue_entitlements(issue_code,format,entitlement_status);

CREATE TABLE IF NOT EXISTS dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES issue_entitlements(id),
  issue_code text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  address_snapshot jsonb NOT NULL,
  courier text,
  tracking_number text,
  tracking_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','packed','shipped','delivered','exception','replacement')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  shipping_email_sent_at timestamptz,
  shipping_email_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entitlement_id)
);
CREATE INDEX IF NOT EXISTS dispatches_status_idx ON dispatches(status,created_at);

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('system','admin','customer')),
  actor_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
