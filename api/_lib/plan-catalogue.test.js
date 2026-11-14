const test=require("node:test");
const assert=require("node:assert/strict");
const {PLANS,getPlan}=require("./subscription-plans");
test("Regular plan amounts and issue quantities match agreed prices",()=>{
 assert.deepEqual([PLANS.regular_monthly.billingAmount,PLANS.regular_quarterly.billingAmount,PLANS.regular_annual.billingAmount],[44900,120000,450000]);
 assert.deepEqual([PLANS.regular_monthly.issuesPerPeriod,PLANS.regular_quarterly.issuesPerPeriod,PLANS.regular_annual.issuesPerPeriod],[1,3,12]);
});
test("Pocket plans match agreed prices",()=>{
 assert.deepEqual([PLANS.pocket_monthly.billingAmount,PLANS.pocket_quarterly.billingAmount,PLANS.pocket_annual.billingAmount],[29900,79800,300000]);
 assert.deepEqual([PLANS.pocket_monthly.pricePerIssue,PLANS.pocket_quarterly.pricePerIssue,PLANS.pocket_annual.pricePerIssue],[29900,26600,25000]);
});
test("unknown plan is rejected",()=>assert.equal(getPlan("bogus"),null));
