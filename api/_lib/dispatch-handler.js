const {getDb}=require("./db");
const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function handler(req,res){
 const key=process.env.INTERVAL_ADMIN_KEY;if(!key||req.headers["x-admin-key"]!==key)return json(res,401,{error:"Unauthorized"});
 if(req.method==="GET"){
  const issue=String(req.query?.issue||""),format=String(req.query?.format||"");
  if(!issue||!["regular","pocket"].includes(format))return json(res,400,{error:"issue and format are required"});
  try{const db=getDb();const rows=await db`SELECT e.id,e.issue_code,e.format,e.quantity,e.entitlement_status,c.email,c.full_name,d.id dispatch_id,d.status dispatch_status,d.tracking_number,a.recipient_name,a.line1,a.line2,a.city,a.state,a.postal_code,a.country_code,a.phone FROM issue_entitlements e JOIN customers c ON c.id=e.customer_id LEFT JOIN dispatches d ON d.entitlement_id=e.id LEFT JOIN subscriptions s ON s.id=e.subscription_id LEFT JOIN customer_addresses a ON a.id=s.address_id WHERE e.issue_code=${issue} AND e.format=${format} AND e.entitlement_status IN ('eligible','held') ORDER BY c.email`;return json(res,200,{issue,format,rows});}catch(e){console.error(e.message);return json(res,500,{error:"Dispatch list unavailable"});}
 }
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const b=req.body||{},action=b.action,db=getDb();
 try{
  if(action==="create"){
   const issue=String(b.issue||""),format=String(b.format||""),batchCode=String(b.batchCode||"");
   if(!issue||!["regular","pocket"].includes(format)||!batchCode)return json(res,400,{error:"issue, format and batchCode required"});
   const rows=format==="regular"?await db`INSERT INTO dispatch_batches(issue_id,format,batch_code,status,created_by) SELECT id,${format},${batchCode},'draft','admin' FROM issues WHERE issue_code=${issue} AND regular_available=true RETURNING id,batch_code`:await db`INSERT INTO dispatch_batches(issue_id,format,batch_code,status,created_by) SELECT id,${format},${batchCode},'draft','admin' FROM issues WHERE issue_code=${issue} AND pocket_available=true RETURNING id,batch_code`;
   if(!rows.length)return json(res,404,{error:"Issue/format not found or unavailable"});
   const batch=rows[0];const result=await db`INSERT INTO dispatches(entitlement_id,issue_code,quantity,address_snapshot,batch_id,status) SELECT e.id,e.issue_code,e.quantity,COALESCE(s.address_snapshot,'{}'::jsonb),${batch.id},'queued' FROM issue_entitlements e JOIN subscriptions s ON s.id=e.subscription_id WHERE e.issue_code=${issue} AND e.format=${format} AND e.entitlement_status='eligible' ON CONFLICT(entitlement_id) DO NOTHING RETURNING id`;
   return json(res,201,{batch:batch.batch_code,createdDispatches:result.length});
  }
  if(action==="tracking"){
   const id=String(b.dispatchId||""),tracking=String(b.trackingNumber||"").trim(),courier=String(b.courier||"").trim(),url=String(b.trackingUrl||"").trim();
   if(!id||!tracking)return json(res,400,{error:"dispatchId and trackingNumber required"});
   const rows=await db`UPDATE dispatches SET tracking_number=${tracking},courier=${courier||null},tracking_url=${url||null},status='shipped',shipped_at=COALESCE(shipped_at,now()),updated_at=now() WHERE id=${id} AND status IN ('queued','packed','exception') RETURNING id,issue_code,status`;
   if(!rows.length)return json(res,409,{error:"Dispatch not found or already shipped"});
   await db`UPDATE issue_entitlements SET entitlement_status='dispatched',updated_at=now() WHERE id=(SELECT entitlement_id FROM dispatches WHERE id=${id})`;
   return json(res,200,{dispatch:rows[0]});
  }
  return json(res,400,{error:"Unknown dispatch action"});
 }catch(e){console.error("dispatch admin",e.message);return json(res,500,{error:"Dispatch operation failed"});}
};
