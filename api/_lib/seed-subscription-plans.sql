-- Seed confirmed Regular plans only. Pocket remains inactive pending user pricing decision.
INSERT INTO subscription_plans
  (code, format, cadence_months, issues_per_period, amount_paise, currency, razorpay_plan_id, active, version, display_name)
VALUES
  ('regular_monthly','regular',1,1,44900,'INR',NULL,true,1,'Regular · Monthly'),
  ('regular_quarterly','regular',3,3,120000,'INR',NULL,true,1,'Regular · Quarterly'),
  ('regular_annual','regular',12,12,450000,'INR',NULL,true,1,'Regular · Annual'),
  ('pocket_monthly','pocket',1,1,0,'INR',NULL,false,1,'Pocket · Monthly (price TBD)'),
  ('pocket_quarterly','pocket',3,3,0,'INR',NULL,false,1,'Pocket · Quarterly (price TBD)'),
  ('pocket_annual','pocket',12,12,0,'INR',NULL,false,1,'Pocket · Annual (price TBD)')
ON CONFLICT (code) DO UPDATE SET
  format=EXCLUDED.format,
  cadence_months=EXCLUDED.cadence_months,
  issues_per_period=EXCLUDED.issues_per_period,
  amount_paise=EXCLUDED.amount_paise,
  currency=EXCLUDED.currency,
  active=EXCLUDED.active,
  version=EXCLUDED.version,
  display_name=EXCLUDED.display_name;
-- Intentionally preserve Razorpay plan IDs already configured by an operator.
