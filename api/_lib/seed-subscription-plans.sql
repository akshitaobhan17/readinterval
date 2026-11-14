-- Seed canonical subscription plans. Safe to run repeatedly.
INSERT INTO subscription_plans
  (code, format, cadence_months, issues_per_period, amount_paise, currency, razorpay_plan_id, active)
VALUES
  ('regular_monthly','regular',1,1,44900,'INR',NULL,true),
  ('regular_quarterly','regular',3,3,120000,'INR',NULL,true),
  ('regular_annual','regular',12,12,450000,'INR',NULL,true),
  ('pocket_monthly','pocket',1,1,29900,'INR',NULL,true),
  ('pocket_quarterly','pocket',3,3,79800,'INR',NULL,true),
  ('pocket_annual','pocket',12,12,300000,'INR',NULL,true)
ON CONFLICT (code) DO UPDATE SET
  format=EXCLUDED.format,
  cadence_months=EXCLUDED.cadence_months,
  issues_per_period=EXCLUDED.issues_per_period,
  amount_paise=EXCLUDED.amount_paise,
  currency=EXCLUDED.currency,
  active=EXCLUDED.active;
-- Intentionally does not overwrite Razorpay plan IDs already configured by an operator.
