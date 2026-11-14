# Preview database migrations

Apply in order to a **new isolated Neon Preview database only**:

1. `api/_lib/subscription-schema.sql` — base schema (migration 001).
2. `api/_lib/migrations/002-subscription-architecture.sql` — architecture additions.
3. `api/_lib/seed-subscription-plans.sql` — confirmed Regular prices only; Pocket plans remain inactive until pricing is decided.

Use a migration runner or Neon SQL editor with transaction support. Confirm the target database/branch before execution. Do not run against Production. The SQL files are versioned in Git but have not been applied to a database in this workspace. After applying, run schema/seed verification queries and save the results without exposing credentials.

Expected active plan rows: Regular Monthly ₹449, Quarterly ₹1,200, Annual ₹4,500. Pocket rows, if present from an earlier seed, must be inactive. Never use the seed to overwrite operator-configured Razorpay plan IDs.
