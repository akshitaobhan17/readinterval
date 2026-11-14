const { PLANS } = require("./_lib/subscription-plans");

/**
 * Public, read-only subscription catalogue.
 * Does not expose Razorpay plan IDs or environment-variable names.
 */
module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    format: plan.product,
    cadence: plan.cadence,
    months: plan.interval,
    issues: plan.issuesPerPeriod,
    pricePerIssuePaise: plan.pricePerIssue,
    billingAmountPaise: plan.billingAmount,
    currency: "INR",
  }));

  return res.status(200).json({ plans });
};
