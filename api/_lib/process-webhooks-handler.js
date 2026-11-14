const {getDb}=require("./db");
const json=(res,s,b)=>res.status(s).json(b);
const statusMap={"subscription.authenticated":"authenticated","subscription.activated":"active","subscription.pending":"pending","subscription.halted":"halted","subscription.cancelled":"cancelled","subscription.paused":"paused","subscription.resumed":"active","subscription.completed":"completed","subscription.expired":"expired"};
const unixDate=v=>Number.isFinite(Number(v))&&Number(v)>0?new Date(Number(v)*1000).toISOString():null;
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 if(!process.env.DATABASE_URL||!process.env.SUBSCRIPTION_WORKER_SECRET)return json(res,503,{error:"Worker is not configured"});
 if(req.headers.authorization!=="Bearer "+process.env.SUBSCRIPTION_WORKER_SECRET)return json(res,401,{error:"Unauthorized"});
 const db=getDb();
 try{
  const rows=await db`WITH due AS (SELECT id FROM webhook_events WHERE processing_status IN ('received','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=now()) ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 25)
  UPDATE webhook_events e SET processing_status='processing',locked_at=now(),last_attempt_at=now(),attempts=attempts+1 FROM due WHERE e.id=due.id RETURNING e.*`;
  let processed=0,failed=0,ignored=0;
  for(const e of rows){
   try{
    const p=e.payload||{},type=e.event_type,sub=p.payload?.subscription?.entity,payment=p.payload?.payment?.entity,invoice=p.payload?.invoice?.entity,sid=sub?.id||payment?.subscription_id||invoice?.subscription_id;
    if(!sid){await db`UPDATE webhook_events SET processing_status='ignored',processed_at=now(),error='No subscription ID' WHERE id=${e.id}`;ignored++;continue;}
    const local=await db`SELECT id FROM subscriptions WHERE razorpay_subscription_id=${sid} LIMIT 1`;
    if(!local.length){await db`UPDATE webhook_events SET processing_status='failed',error='Subscription mapping not found',next_attempt_at=now()+interval '5 minutes' WHERE id=${e.id}`;failed++;continue;}
    const mapped=statusMap[type];
    if(mapped)await db`UPDATE subscriptions SET status=${mapped},provider_status=${sub?.status||mapped},start_at=COALESCE(start_at,CASE WHEN ${sub?.start_at||0}>0 THEN to_timestamp(${sub.start_at}) END),next_charge_at=CASE WHEN ${sub?.charge_at||0}>0 THEN to_timestamp(${sub.charge_at}) ELSE next_charge_at END,updated_at=now() WHERE id=${local[0].id}`;
    if(payment){
     const captured=type==="subscription.charged"||payment.status==="captured";
     const periodStart=unixDate(invoice?.billing_start||invoice?.start_at||payment?.created_at),periodEnd=unixDate(invoice?.billing_end||invoice?.end_at);
     const paymentId=payment.id||null,invoiceId=invoice?.id||null;
     const existing=paymentId?await db`SELECT id FROM subscription_payments WHERE razorpay_payment_id=${paymentId}`:invoiceId?await db`SELECT id FROM subscription_payments WHERE razorpay_invoice_id=${invoiceId}`:[];
     if(existing.length){
      await db`UPDATE subscription_payments SET status=CASE WHEN ${captured} THEN 'captured' WHEN ${payment.status==="failed"} THEN 'failed' ELSE status END,paid_at=CASE WHEN ${captured} THEN COALESCE(paid_at,now()) ELSE paid_at END,provider_status=${payment.status||type},billing_period_start=COALESCE(billing_period_start,${periodStart}),billing_period_end=COALESCE(billing_period_end,${periodEnd}),raw_data=${payment}::jsonb WHERE id=${existing[0].id}`;
     }else{
      await db`INSERT INTO subscription_payments(subscription_id,razorpay_payment_id,razorpay_invoice_id,amount_paise,currency,status,paid_at,provider_status,raw_data,billing_period_start,billing_period_end)
      VALUES(${local[0].id},${paymentId},${invoiceId},${payment.amount||invoice?.amount||0},${payment.currency||invoice?.currency||"INR"},${captured?"captured":payment.status==="failed"?"failed":"authorized"},${captured?"now()":null},${payment.status||type},${payment}::jsonb,${periodStart},${periodEnd}) ON CONFLICT DO NOTHING`;
     }
    }
    await db`UPDATE webhook_events SET processing_status='processed',processed_at=now(),error=NULL,next_attempt_at=NULL,locked_at=NULL WHERE id=${e.id}`;processed++;
   }catch(err){await db`UPDATE webhook_events SET processing_status='failed',error=${String(err.message).slice(0,500)},next_attempt_at=now()+interval '5 minutes',locked_at=NULL WHERE id=${e.id}`;failed++;}
  }
  return json(res,200,{claimed:rows.length,processed,failed,ignored});
 }catch(e){console.error("webhook worker failed",e.message);return json(res,500,{error:"Webhook processing failed"});}
};
