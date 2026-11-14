const crypto=require("node:crypto");
const json=(res,s,b)=>res.status(s).json(b);
function readRaw(req){return new Promise((resolve,reject)=>{const chunks=[];req.on("data",chunk=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject);});}
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret||!process.env.DATABASE_URL)return json(res,503,{error:"Webhook is not configured"});
 let raw;try{raw=Buffer.isBuffer(req.rawBody)?req.rawBody:typeof req.rawBody==="string"?Buffer.from(req.rawBody):await readRaw(req);}catch(e){console.error("webhook body read failed",e.message);return json(res,400,{error:"Webhook body unavailable"});}
 const signature=String(req.headers["x-razorpay-signature"]||"");
 const expected=crypto.createHmac("sha256",secret).update(raw).digest(),provided=Buffer.from(signature,"hex");
 if(!signature||provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return json(res,400,{error:"Invalid signature"});
 let event;try{event=JSON.parse(raw.toString("utf8"));}catch{return json(res,400,{error:"Invalid JSON"});}
 const eventId=String(req.headers["x-razorpay-event-id"]||"").trim();if(!eventId)return json(res,400,{error:"Missing Razorpay event ID"});
 const db=require("./db").getDb();
 try{
  const rows=await db`INSERT INTO webhook_events(provider,event_id,provider_event_id,event_type,payload,signature_valid,processing_status)
  VALUES('razorpay',${eventId},${eventId},${event.event||"unknown"},${event}::jsonb,true,'received')
  ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`;
  return json(res,200,{received:true,duplicate:!rows.length,queued:Boolean(rows.length)});
 }catch(e){console.error("webhook receipt failed",e.message);return json(res,500,{error:"Webhook receipt could not be persisted"});}
};
module.exports.config={api:{bodyParser:false}};
