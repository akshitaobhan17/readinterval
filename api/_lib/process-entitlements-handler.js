const {getDb}=require("./db");
const {allocateIssueCodes,entitlementIdempotencyKey}=require("./_lib/entitlements");
const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 if(!process.env.DATABASE_URL||!process.env.SUBSCRIPTION_WORKER_SECRET)return json(res,503,{error:"Worker not configured"});
 if(req.headers.authorization!=="Bearer "+process.env.SUBSCRIPTION_WORKER_SECRET)return json(res,401,{error:"Unauthorized"});
 const db=getDb();try{
  const payments=await db`SELECT p.id,p.subscription_id,p.billing_period_start,p.billing_period_end,p.status,p.paid_at,s.plan_code,s.plan_version,s.status AS subscription_status,s.cancellation_effective_at,c.id AS customer_id
   FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id JOIN customers c ON c.id=s.customer_id
   WHERE p.status='captured' AND p.paid_at IS NOT NULL AND p.billing_period_start IS NOT NULL AND p.billing_period_end IS NOT NULL AND p.entitlement_processed_at IS NULL
   ORDER BY p.paid_at LIMIT 20`;
  let done=0,failed=0;
  for(const p of payments){
   try{
    const lock=await db`INSERT INTO entitlement_processing_runs(payment_id,status) VALUES(${p.id},'processing') ON CONFLICT(payment_id) DO NOTHING RETURNING id`;
    if(!lock.length)continue;
    const plans=await db`SELECT format,issues_per_period FROM subscription_plans WHERE code=${p.plan_code} AND version=${p.plan_version} LIMIT 1`;
    if(!plans.length)throw new Error("Plan version missing");
    const issues=await db`SELECT issue_code,entitlement_cutoff_at,regular_available,pocket_available FROM issues WHERE entitlement_cutoff_at>=${p.billing_period_start} AND entitlement_cutoff_at<${p.billing_period_end} AND publication_status<>'cancelled' ORDER BY entitlement_cutoff_at`;
    const allocated=allocateIssueCodes({plan:plans[0],issues,periodStart:p.billing_period_start,periodEnd:p.billing_period_end,cancellationEffectiveAt:p.cancellation_effective_at});
    const created=[];
    for(const item of allocated){
     const key=entitlementIdempotencyKey(p.subscription_id,item.issueCode,item.format);
     const rows=await db`INSERT INTO issue_entitlements(subscription_id,customer_id,issue_code,format,quantity,payment_id,entitlement_status,billing_period_start,billing_period_end,entitlement_reason,created_by)
      VALUES(${p.subscription_id},${p.customer_id},${item.issueCode},${item.format},1,${p.id},'eligible',${p.billing_period_start},${p.billing_period_end},'paid_period',${key})
      ON CONFLICT(subscription_id,issue_code) DO NOTHING RETURNING issue_code`;
     if(rows.length)created.push(rows[0].issue_code);
    }
    await db`UPDATE subscription_payments SET entitlement_processed_at=now(),entitlement_processing_error=NULL WHERE id=${p.id}`;
    await db`UPDATE entitlement_processing_runs SET status='completed',issue_codes=${created},completed_at=now() WHERE payment_id=${p.id}`;done++;
   }catch(e){await db`UPDATE subscription_payments SET entitlement_processing_error=${String(e.message).slice(0,500)} WHERE id=${p.id}`;await db`UPDATE entitlement_processing_runs SET status='failed',error=${String(e.message).slice(0,500)} WHERE payment_id=${p.id}`;failed++;}
  }
  return json(res,200,{scanned:payments.length,completed:done,failed});
 }catch(e){console.error("paid entitlement worker",e.message);return json(res,500,{error:"Entitlement processing failed"});}
};
