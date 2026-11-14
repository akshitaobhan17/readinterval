/**
 * Entitlement allocation helpers. Pure/testable; no DB or provider side effects.
 * Billing coverage is supplied from provider-confirmed payment periods.
 */
function allocateIssueCodes({plan,issues,periodStart,periodEnd,cancellationEffectiveAt}) {
  if(!plan||!Number.isInteger(plan.issuesPerPeriod)||plan.issuesPerPeriod<1) throw new Error("Invalid plan");
  if(!Array.isArray(issues)) throw new Error("Issue schedule must be an array");
  const start=new Date(periodStart),end=new Date(periodEnd);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) throw new Error("Invalid billing period");
  const cancelAt=cancellationEffectiveAt?new Date(cancellationEffectiveAt):null;
  const eligible=issues.filter(issue=>{
    if(!issue?.issue_code||!issue.entitlement_cutoff_at) return false;
    const cutoff=new Date(issue.entitlement_cutoff_at);
    if(!Number.isFinite(cutoff.getTime())||cutoff<start||cutoff>=end||(cancelAt&&cutoff>=cancelAt)) return false;
    return plan.format==="regular"?issue.regular_available===true:plan.format==="pocket"&&issue.pocket_available===true;
  }).sort((a,b)=>new Date(a.entitlement_cutoff_at)-new Date(b.entitlement_cutoff_at));
  if(eligible.length<plan.issuesPerPeriod) throw new Error(`Insufficient issue schedule: expected ${plan.issuesPerPeriod}, found ${eligible.length}`);
  return eligible.slice(0,plan.issuesPerPeriod).map(i=>({issueCode:i.issue_code,format:plan.format,quantity:1,billingPeriodStart:start.toISOString(),billingPeriodEnd:end.toISOString()}));
}
function entitlementIdempotencyKey(subscriptionId,issueCode,format){
  if(!subscriptionId||!issueCode||!format) throw new Error("Missing entitlement identity");
  return `${subscriptionId}:${issueCode}:${format}`;
}
module.exports={allocateIssueCodes,entitlementIdempotencyKey};
