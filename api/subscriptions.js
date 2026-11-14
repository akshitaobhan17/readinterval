/**
 * Consolidated subscription API router (Vercel Hobby function cap).
 * POST /api/subscriptions?action=checkout|webhook|process-webhooks|process-entitlements|dispatch
 */
const checkout=require("./_lib/subscription-checkout-handler");
const webhook=require("./_lib/subscription-webhook-handler");
const processWebhooks=require("./_lib/process-webhooks-handler");
const processEntitlements=require("./_lib/process-entitlements-handler");
const dispatch=require("./_lib/dispatch-handler");
module.exports=async function(req,res){
 const action=String(req.query?.action||req.body?.action||"");
 switch(action){
  case "checkout": return checkout(req,res);
  case "webhook": return webhook(req,res);
  case "process-webhooks": return processWebhooks(req,res);
  case "process-entitlements": return processEntitlements(req,res);
  case "dispatch": return dispatch(req,res);
  default:return res.status(400).json({error:"Unknown subscription action"});
 }
};
