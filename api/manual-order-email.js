const { get } = require("@vercel/blob");
const PATH="interval/manual-orders.json";
function authorised(req){return !!process.env.INTERVAL_ADMIN_KEY&&req.headers["x-admin-key"]===process.env.INTERVAL_ADMIN_KEY;}
function escapeHtml(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
async function readOrders(){try{const r=await get(PATH,{access:"private",useCache:false});if(!r)return[];return JSON.parse(await new Response(r.stream).text()||"[]");}catch(e){if(e&&(e.statusCode===404||e.code==="BLOB_NOT_FOUND"))return[];throw e;}}
async function sendEmail({to,subject,html,text}){const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[to],subject,html,text})});if(!r.ok)throw new Error("Resend error "+r.status);}
module.exports=async function(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!authorised(req))return res.status(401).json({error:"Unauthorised"});
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return res.status(500).json({error:"Resend is not configured."});
 let b;try{b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{})}catch{return res.status(400).json({error:"Invalid request."})}
 const id=String(b.order_id||"");if(!id)return res.status(400).json({error:"Order ID is required."});
 const emailType=String(b.type||"gift");
 try{
  const orders=await readOrders(),idx=orders.findIndex(x=>x.id===id);if(idx===-1)return res.status(404).json({error:"Manual order not found."});
  const o=orders[idx];
  if(emailType==="shipped"&&o.shippingEmailSentAt)return res.status(409).json({error:"A shipping email has already been sent for this order."});
  if(emailType==="delivered"&&o.deliveryEmailSentAt)return res.status(409).json({error:"A delivery email has already been sent for this order."});
  if(emailType==="delivered"&&o.status!=="Shipped")return res.status(400).json({error:"Order must be shipped before it can be marked delivered."});
  const name=escapeHtml(o.name),product=escapeHtml(o.product||"The Interval"),tracking=escapeHtml(o.tracking||"");
  let subject,html,text;
  if(emailType==="shipped"){
   if(!tracking)return res.status(400).json({error:"Tracking number is required."});
   subject="Your Interval order is on its way";
   html='<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px">Your Interval is on its way.</h1><p>Hi '+name+',</p><p>Your copy of <strong>'+product+'</strong> has been posted.</p><div style="border:2px solid #111;padding:18px;margin:24px 0"><p><strong>Tracking number:</strong> '+tracking+'</p><p><strong>Delivery address:</strong> '+escapeHtml([o.address,o.city,o.state,o.pin].filter(Boolean).join(", "))+'</p></div><p><a href="https://www.indiapost.gov.in/" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none">Track your parcel</a></p><p>Thanks for being one of the first to get Issue 01.</p><p>— The Interval</p></div>';
   text='Your Interval is on its way.\n\nHi '+o.name+',\n\nYour copy of '+(o.product||"The Interval")+' has been posted.\n\nTracking number: '+(o.tracking||"")+'\nDelivery address: '+[o.address,o.city,o.state,o.pin].filter(Boolean).join(", ")+'\n\nTrack your parcel: https://www.indiapost.gov.in/\n\nThanks for being one of the first to get Issue 01.\n\n— The Interval';
  }else if(emailType==="delivered"){
   subject="Your Interval has arrived";
   html='<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px">Your Interval has arrived.</h1><p>Hi '+name+',</p><p>Your copy of <strong>'+product+'</strong> has arrived.</p><p>Hope it finds you at the right moment.</p><p>— The Interval</p></div>';
   text='Your Interval has arrived.\n\nHi '+o.name+',\n\nYour copy of '+(o.product||"The Interval")+' has arrived.\n\nHope it finds you at the right moment.\n\n— The Interval';
  }else{
   subject="A little Interval is on its way";
   html='<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px">A little Interval is on its way.</h1><p>Hi '+name+',</p><p>We wanted to send you a copy of <strong>The Interval</strong> as a little gift.</p><div style="border:2px solid #111;padding:18px;margin:24px 0"><p><strong>Your copy:</strong> '+product+'</p><p><strong>Status:</strong> Already on its way to you.</p>'+(tracking?'<p><strong>Tracking:</strong> '+tracking+'</p>':'')+'</div><p>No purchase, no action needed — just a little something to read, play with, and hopefully leave on the coffee table.</p><p>Hope it reaches you soon.</p><p>— The Interval</p></div>';
   text='A little Interval is on its way.\n\nHi '+o.name+',\n\nWe wanted to send you a copy of The Interval as a little gift.\n\nYour copy: '+(o.product||"The Interval")+'\nStatus: Already on its way to you.'+(o.tracking?"\nTracking: "+o.tracking:"")+'\n\nNo purchase, no action needed — just a little something to read, play with, and hopefully leave on the coffee table.\n\nHope it reaches you soon.\n\n— The Interval';
  }
  await sendEmail({to:o.email,subject,html,text});
  const now=new Date().toISOString();
  orders[idx]={...o,...(emailType==="shipped"?{status:"Shipped",shippedAt:o.shippedAt||now,shippingEmailSentAt:now}:{emailType==="delivered"?{status:"Delivered",deliveredAt:o.deliveredAt||now,deliveryEmailSentAt:now}:{giftEmailSentAt:now})};
  const {put}=require("@vercel/blob");
  await put(PATH,JSON.stringify(orders,null,2),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  return res.status(200).json({sent:true});
 }catch(e){console.error("Manual order email error:",e);return res.status(500).json({error:"Could not send the "+(emailType==="delivered"?"delivery":emailType==="shipped"?"shipping":"gift")+" email."})}
};