const { getDb } = require("./_lib/db");

/**
 * Admin-only diagnostic endpoint for Preview database connectivity.
 * Returns no customer or credential data.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.INTERVAL_ADMIN_KEY;
  const supplied = req.headers["x-admin-key"];
  if (!key || !supplied || supplied !== key) return res.status(401).json({ error: "Unauthorized" });
  try {
    const sql = getDb();
    const rows = await sql`SELECT current_timestamp AS checked_at, count(*)::int AS plan_count FROM subscription_plans WHERE active = true`;
    return res.status(200).json({ ok: true, database: "connected", activePlans: rows[0].plan_count, checkedAt: rows[0].checked_at });
  } catch (err) {
    console.error("Subscription DB health check failed:", err?.message);
    return res.status(503).json({ ok: false, database: "unavailable" });
  }
};
