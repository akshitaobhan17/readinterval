const test=require("node:test");
const assert=require("node:assert/strict");
const {allocateIssueCodes,entitlementIdempotencyKey}=require("./entitlements");
const plan={format:"regular",issuesPerPeriod:2};
const issues=[
 {issue_code:"I-01",entitlement_cutoff_at:"2026-01-10T00:00:00Z",regular_available:true,pocket_available:true},
 {issue_code:"I-02",entitlement_cutoff_at:"2026-02-10T00:00:00Z",regular_available:true,pocket_available:true},
 {issue_code:"I-03",entitlement_cutoff_at:"2026-03-10T00:00:00Z",regular_available:true,pocket_available:true},
];
test("allocates chronological issues within a paid coverage period",()=>{
 const out=allocateIssueCodes({plan,issues,periodStart:"2026-01-01",periodEnd:"2026-03-01"});
 assert.deepEqual(out.map(x=>x.issueCode),["I-01","I-02"]);
});
test("excludes issue cutoffs outside period and unavailable format",()=>{
 assert.throws(()=>allocateIssueCodes({plan:{format:"pocket",issuesPerPeriod:2},issues:issues.map(i=>({...i,pocket_available:false})),periodStart:"2026-01-01",periodEnd:"2026-03-01"}),/Insufficient/);
});
test("respects cancellation effective date",()=>{
 assert.throws(()=>allocateIssueCodes({plan,issues,periodStart:"2026-01-01",periodEnd:"2026-03-01",cancellationEffectiveAt:"2026-02-01"}),/Insufficient/);
});
test("rejects invalid period",()=>assert.throws(()=>allocateIssueCodes({plan,issues,periodStart:"bad",periodEnd:"2026-03-01"}),/Invalid/));
test("entitlement key is deterministic and validates identity",()=>{
 assert.equal(entitlementIdempotencyKey("sub","I-01","regular"),"sub:I-01:regular");
 assert.throws(()=>entitlementIdempotencyKey("","I-01","regular"),/Missing/);
});
