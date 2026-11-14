const test=require("node:test");const assert=require("node:assert/strict");const {PLANS}=require("./subscription-plans");
const terms=Object.fromEntries(Object.entries(PLANS).map(([k,p])=>[k,p.cadence==="monthly"?12:p.cadence==="quarterly"?4:1]));
test("subscription term counts produce one year of billing: monthly 12, quarterly 4, annual 1",()=>{
 assert.deepEqual([terms.regular_monthly,terms.regular_quarterly,terms.regular_annual],[12,4,1]);
 assert.deepEqual([terms.pocket_monthly,terms.pocket_quarterly,terms.pocket_annual],[12,4,1]);
});
