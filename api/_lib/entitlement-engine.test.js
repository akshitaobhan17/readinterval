const test=require("node:test");const assert=require("node:assert/strict");
const {allocateIssueCodes}=require("./entitlements");
const schedule=Array.from({length:12},(_,n)=>({issue_code:"R"+(n+1),entitlement_cutoff_at:new Date(Date.UTC(2026,n,10)).toISOString(),regular_available:true,pocket_available:true}));
test("annual plan receives exactly twelve available issues",()=>assert.equal(allocateIssueCodes({plan:{format:"regular",issuesPerPeriod:12},issues:schedule,periodStart:"2026-01-01",periodEnd:"2027-01-01"}).length,12));
test("quarterly plan returns three issues",()=>assert.deepEqual(allocateIssueCodes({plan:{format:"pocket",issuesPerPeriod:3},issues:schedule,periodStart:"2026-01-01",periodEnd:"2026-04-01"}).map(x=>x.issueCode),["R1","R2","R3"]));
test("cutoff exactly at period end is not covered",()=>assert.throws(()=>allocateIssueCodes({plan:{format:"regular",issuesPerPeriod:2},issues:[schedule[0],{...schedule[1],entitlement_cutoff_at:"2026-04-01"}],periodStart:"2026-01-01",periodEnd:"2026-04-01"}),/Insufficient/));
