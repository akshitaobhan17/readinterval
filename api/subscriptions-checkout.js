const Razorpay=require("razorpay");
const {getDb}=require("./_lib/db");
const {getPlan}=require("./_lib/subscription-plans");

const json=(res,status,body)=>res.status(status).json(body);
const clean=v=>typeof v==="string"?v.trim():"";
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed"});}
 const key=clean(req.headers["x-idempotency-key"]);
 if(!key||key.length<12||key.length>128)return json(res,400,{error:"A valid checkout idempotency key is required"});
 const b=req.body||{},plan=getPlan(clean(b.planCode));
 if(!plan||!plan.enabled||!Number.isInteger(plan.billingAmount)||plan.billingAmount<=0)return json(res,400,{error:"Invalid subscription plan"});
 const name=clean(b.fullName),email=clean(b.email).toLowerCase(),phone=clean(b.phone);
 const a=b.address||{},recipient=clean(a.recipientName)||name,line1=clean(a.line1),line2=clean(a.line2),city=clean(a.city),state=clean(a.state),postal=clean(a.postalCode),country=clean(a.countryCode)||"IN";
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.length<8||!line1||!city||!postal||!/^[A-Z]{2}$/.test(country))return json(res,400,{error:"Complete customer and delivery address details are required"});
 const planId=process.env[plan.razorpayPlanEnv];
 if(!planId)return json(res,503,{error:"This plan is not configured for recurring billing yet"});
 if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET||!process.env.DATABASE_URL)return json(res,503,{error:"Subscription checkout is not configured"});
 const db=getDb(),rz=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
 try{
  const existing=await db`SELECT id,razorpay_subscription_id,status FROM subscriptions WHERE checkout_idempotency_key=${key} LIMIT 1`;
  if(existing.length)return json(res,200,{subscriptionId:existing[0].razorpay_subscription_id,localId:existing[0].id,status:existing[0].status,reused:true});
  // Create provider subscription first; compensate by cancelling if local transaction fails.
  const provider=await rz.subscriptions.create({plan_id:planId,quantity:1,total_count:plan.interval,customer_notify:1,notes:{interval_customer_email:email,interval_plan_code:b.planCode,interval_checkout_key:key}});
  if(!provider?.id)throw new Error("Razorpay did not return a subscription ID");
  try{
   const rows=await db`WITH c AS (
     INSERT INTO customers(email,normalized_email,full_name,phone) VALUES(${email},${email},${name},${phone})
     ON CONFLICT(normalized_email) DO UPDATE SET full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,updated_at=now()
     RETURNING id
   ), a AS (
     INSERT INTO customer_addresses(customer_id,recipient_name,line1,line2,city,state,postal_code,country_code,phone,is_default)
     SELECT id,${recipient},${line1},${line2||null},${city},${state||null},${postal},${country},${phone},true FROM c
     RETURNING id,customer_id
   )
   INSERT INTO subscriptions(customer_id,plan_code,plan_version,razorpay_subscription_id,status,quantity,address_id,address_snapshot,checkout_idempotency_key)
   SELECT a.customer_id,${b.planCode},1,${provider.id},'created',1,a.id,${JSON.stringify({recipientName:recipient,line1,line2,city,state,postalCode:postal,countryCode:country,phone})}::jsonb,${key} FROM a
   RETURNING id,razorpay_subscription_id,status`;
   return json(res,201,{localId:rows[0].id,subscriptionId:rows[0].razorpay_subscription_id,status:rows[0].status,shortUrl:provider.short_url,planCode:b.planCode,amountPaise:plan.billingAmount,currency:"INR"});
  }catch(dbErr){try{await rz.subscriptions.cancel(provider.id,false);}catch(cancelErr){console.error("subscription compensation failed",provider.id,cancelErr.message);}throw dbErr;}
 }catch(e){console.error("subscription checkout failed",e.message);return json(res,500,{error:"Unable to start subscription checkout"});}
};
