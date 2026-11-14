const {getDb}=require("./db");const json=(res,s,b)=>res.status(s).json(b);
module.exports=async function(req,res){
 const k=process.env.INTERVAL_ADMIN_KEY;if(!k||req.headers["x-admin-key"]!==k)return json(res,401,{error:"Unauthorized"});
 if(req.method!=="GET")return json(res,405,{error:"Method not allowed"});
 const q=String(req.query?.q||"").trim(),status=String(req.query?.status||"");
 try{const db=getDb();const rows=await db`SELECT s.id,s.razorpay_subscription_id,s.plan_code,s.status,s.provider_status,s.next_charge_at,s.cancel_at_period_end,s.created_at,c.full_name,c.email,c.phone FROM subscriptions s JOIN customers c ON c.id=s.customer_id WHERE (${q===""} OR c.email ILIKE ${"%"+q+"%"} OR c.full_name ILIKE ${"%"+q+"%"} OR c.phone ILIKE ${"%"+q+"%"} OR s.razorpay_subscription_id=${q}) AND (${status===""} OR s.status=${status}) ORDER BY s.created_at DESC LIMIT 100`;
 const totals=await db`SELECT status,count(*)::int AS count FROM subscriptions GROUP BY status`;
 const revenue=await db`SELECT COALESCE(sum(amount_paise),0)::bigint AS collected_paise,count(*)::int AS successful_payments FROM subscription_payments WHERE status='captured'`;
 return json(res,200,{subscribers:rows,statusCounts:totals,collected:revenue[0]});}catch(e){console.error("subscriber admin",e.message);return json(res,500,{error:"Subscriber report unavailable"});}
};
