const { PLANS } = require("./_lib/subscription-plans");
/** Public, read-only catalogue. Unpriced/inactive plans are never exposed. */
module.exports = function handler(req,res) {
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"});}
  res.setHeader("Cache-Control","public, max-age=300, stale-while-revalidate=600");
  const plans=Object.entries(PLANS).filter(([,p])=>p.enabled&&Number.isInteger(p.billingAmount)&&p.billingAmount>0).map(([id,p])=>({
    id,format:p.product,cadence:p.cadence,months:p.interval,issues:p.issuesPerPeriod,
    pricePerIssuePaise:p.pricePerIssue,billingAmountPaise:p.billingAmount,currency:"INR"
  }));
  return res.status(200).json({plans});
};
