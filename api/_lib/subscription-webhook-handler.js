const crypto=require("node:crypto");
const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret||!process.env.DATABASE_URL)return json(res,503,{error:"Webhook is not configured"});
 const raw=req.rawBody;if(!raw)return json(res,400,{error:"Raw webhook body unavailable"});
 const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex"),provided=Buffer.from(String(req.headers["x-razorpay-signature"]||"")),want=Buffer.from(expected);
 if(provided.length!==want.length||!crypto.timingSafeEqual(provided,want))return json(res,400,{error:"Invalid signature"});
 let event;try{event=JSON.parse(raw.toString("utf8"));}catch{return json(res,400,{error:"Invalid JSON"});}
 const eventId=req.headers["x-razorpay-event-id"];if(!eventId)return json(res,400,{error:"Missing Razorpay event ID"});
 const db=require("./db").getDb();
 try{
  const rows=await db`INSERT INTO webhook_events(provider,event_id,provider_event_id,event_type,payload,signature_valid,processing_status)
  VALUES('razorpay',${eventId},${eventId},${event.event||"unknown"},${event}::jsonb,true,'received')
  ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`;
  return json(res,200,{received:true,duplicate:!rows.length,queued:Boolean(rows.length)});
 }catch(e){console.error("webhook receipt failed",e.message);return json(res,500,{error:"Webhook receipt could not be persisted"});}
};
