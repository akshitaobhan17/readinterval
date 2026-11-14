const {getDb}=require("./_lib/db");
const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 if(!process.env.DATABASE_URL)return json(res,503,{error:"Database is not configured"});
 const db=getDb();
 try{
  const rows=await db`WITH due AS (
    SELECT id FROM webhook_events WHERE processing_status IN ('received','failed')
      AND (next_attempt_at IS NULL OR next_attempt_at<=now())
      ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 25
  )
  UPDATE webhook_events e SET processing_status='processing',locked_at=now(),last_attempt_at=now(),attempts=attempts+1
  FROM due WHERE e.id=due.id RETURNING e.*`;
  let processed=0,failed=0,ignored=0;
  for(const e of rows){
   try{
    const p=e.payload||{},type=e.event_type,sub=p.payload?.subscription?.entity,payment=p.payload?.payment?.entity,invoice=p.payload?.invoice?.entity;
    const sid=sub?.id||payment?.subscription_id||invoice?.subscription_id;
    if(!sid){await db`UPDATE webhook_events SET processing_status='ignored',processed_at=now(),error='No subscription ID' WHERE id=${e.id}`;ignored++;continue;}
    const local=await db`SELECT id FROM subscriptions WHERE razorpay_subscription_id=${sid} LIMIT 1`;
    if(!local.length){await db`UPDATE webhook_events SET processing_status='failed',error='Subscription mapping not found',next_attempt_at=now()+interval '5 minutes' WHERE id=${e.id}`;failed++;continue;}
    const statusMap={"subscription.authenticated":"authenticated","subscription.activated":"active","subscription.pending":"pending","subscription.halted":"halted","subscription.cancelled":"cancelled","subscription.paused":"paused","subscription.resumed":"active","subscription.completed":"completed","subscription.expired":"expired"};
    const mapped=statusMap[type];
    if(mapped)await db`UPDATE subscriptions SET status=${mapped},provider_status=${sub?.status||mapped},start_at=COALESCE(start_at,CASE WHEN ${sub?.start_at||0}>0 THEN to_timestamp(${sub.start_at}) END),next_charge_at=CASE WHEN ${sub?.charge_at||0}>0 THEN to_timestamp(${sub.charge_at}) ELSE next_charge_at END,updated_at=now() WHERE id=${local[0].id}`;
    if(payment){
     const captured=type==="subscription.charged"||payment.status==="captured";
     await db`INSERT INTO subscription_payments(subscription_id,razorpay_payment_id,razorpay_invoice_id,amount_paise,currency,status,paid_at,provider_status,raw_data)
      VALUES(${local[0].id},${payment.id||null},${invoice?.id||null},${payment.amount||invoice?.amount||0},${payment.currency||invoice?.currency||"INR"},${captured?"captured":payment.status==="failed"?"failed":"authorized"},${captured?"now()":null},${payment.status||type},${payment}::jsonb)
      ON CONFLICT DO NOTHING`;
    }
    await db`UPDATE webhook_events SET processing_status='processed',processed_at=now(),error=NULL,next_attempt_at=NULL WHERE id=${e.id}`;processed++;
   }catch(err){await db`UPDATE webhook_events SET processing_status='failed',error=${String(err.message).slice(0,500)},next_attempt_at=now()+interval '5 minutes' WHERE id=${e.id}`;failed++;}
  }
  return json(res,200,{claimed:rows.length,processed,failed,ignored});
 }catch(e){console.error("webhook worker failed",e.message);return json(res,500,{error:"Webhook processing failed"});}
};
