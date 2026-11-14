/**
 * Subscription catalogue. INR amounts are integer paise.
 * Confirmed Regular and Pocket prices; cadence charges are recurring totals.
 */
const PLANS = Object.freeze({
  regular_monthly: Object.freeze({ product:"regular", cadence:"monthly", period:"monthly", interval:1, issuesPerPeriod:1, pricePerIssue:44900, billingAmount:44900, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_REGULAR_MONTHLY" }),
  regular_quarterly: Object.freeze({ product:"regular", cadence:"quarterly", period:"monthly", interval:3, issuesPerPeriod:3, pricePerIssue:40000, billingAmount:120000, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_REGULAR_QUARTERLY" }),
  regular_annual: Object.freeze({ product:"regular", cadence:"annual", period:"monthly", interval:12, issuesPerPeriod:12, pricePerIssue:37500, billingAmount:450000, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_REGULAR_ANNUAL" }),
  pocket_monthly: Object.freeze({ product:"pocket", cadence:"monthly", period:"monthly", interval:1, issuesPerPeriod:1, pricePerIssue:29900, billingAmount:29900, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_POCKET_MONTHLY" }),
  pocket_quarterly: Object.freeze({ product:"pocket", cadence:"quarterly", period:"monthly", interval:3, issuesPerPeriod:3, pricePerIssue:26600, billingAmount:79800, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_POCKET_QUARTERLY" }),
  pocket_annual: Object.freeze({ product:"pocket", cadence:"annual", period:"monthly", interval:12, issuesPerPeriod:12, pricePerIssue:25000, billingAmount:300000, enabled:true, razorpayPlanEnv:"RAZORPAY_PLAN_POCKET_ANNUAL" }),
});
function getPlan(key) { return Object.prototype.hasOwnProperty.call(PLANS,key) ? PLANS[key] : null; }
module.exports = { PLANS, getPlan };
