const crypto=require("node:crypto");
const {getDb}=require("./_lib/db");
const {PLANS}=require("./_lib/subscription-plans");
const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;
 if(!secret||!process.env.DATABASE_URL)return json(res,503,{error:"Webhook is not configured"});
 const raw=req.rawBody;
 if(!raw)return json(res,400,{error:"Raw webhook body unavailable"});
 const signature=req.headers["x-razorpay-signature"];
 const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex");
 const a=Buffer.from(String(signature||"")),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return json(res,400,{error:"Invalid signature"});
 let event;try{event=JSON.parse(raw.toString("utf8"));}catch{return json(res,400,{error:"Invalid JSON"});}
 const eventType=event.event||"unknown",subscription=event.payload?.subscription?.entity,payment=event.payload?.payment?.entity,invoice=event.payload?.invoice?.entity;
 const subId=subscription?.id||payment?.subscription_id||invoice?.subscription_id;
 const providerEventId=req.headers["x-razorpay-event-id"]||null;
 const db=getDb();
 try{
  // Durable, idempotent inbox. Event processing is deliberately separate from receipt.
  const inserted=await db`INSERT INTO webhook_events(provider,event_id,provider_event_id,event_type,payload,signature_valid,processing_status)
   VALUES('razorpay',${providerEventId},${providerEventId},${eventType},${event}::jsonb,true,'received')
   ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`;
  if(!inserted.length)return json(res,200,{received:true,duplicate:true});
  // Minimal synchronous projection; event remains recorded if local mapping is absent.
  if(subId){
   const map={ "subscription.authenticated":"authenticated","subscription.activated":"active","subscription.pending":"pending","subscription.halted":"halted","subscription.cancelled":"cancelled","subscription.paused":"paused","subscription.resumed":"active","subscription.completed":"completed","subscription.expired":"expired"};
   const status=map[eventType];
   if(status)await db`UPDATE subscriptions SET status=${status},provider_status=${subscription?.status||status},start_at=COALESCE(start_at,to_timestamp(${subscription?.start_at||0})),next_charge_at=CASE WHEN ${subscription?.charge_at||0}>0 THEN to_timestamp(${subscription?.charge_at||0}) ELSE next_charge_at END,updated_at=now() WHERE razorpay_subscription_id=${subId}`;
   if(payment){
    const local=await db`SELECT id FROM subscriptions WHERE razorpay_subscription_id=${subId} LIMIT 1`;
    if(local.length){
     const paid=eventType==="subscription.charged"||payment.status==="captured";
     await db`INSERT INTO subscription_payments(subscription_id,razorpay_payment_id,razorpay_invoice_id,amount_paise,currency,status,paid_at,provider_status,raw_data)
      VALUES(${local[0].id},${payment.id},${invoice?.id||null},${payment.amount||0},${payment.currency||"INR"},${paid?"captured":payment.status==="failed"?"failed":"authorized"},${paid?"now()":null},${payment.status||eventType},${payment}::jsonb)
      ON CONFLICT(razorpay_payment_id) DO NOTHING`;
    }
   }
   await db`UPDATE webhook_events SET processing_status='processed',processed_at=now(),attempts=attempts+1 WHERE provider_event_id=${providerEventId}`;
  }else await db`UPDATE webhook_events SET processing_status='ignored',processed_at=now(),attempts=attempts+1,error='No subscription mapping in event' WHERE provider_event_id=${providerEventId}`;
  return json(res,200,{received:true,processed:Boolean(subId)});
 }catch(e){console.error("subscription webhook processing error",e.message);return json(res,500,{error:"Webhook processing will be retried"});}
};
