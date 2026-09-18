const Razorpay = require("razorpay");

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return res.status(500).json({ error: "Razorpay is not configured." });

  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const result = await razorpay.orders.all({ count: 100 });
    const paidOrders = (result.items || [])
      .filter(o => o.status === "paid" && o.notes && o.notes.product === "The Interval Issue 01")
      .map(o => ({
        id:o.id,date:o.created_at,type:"paid",amount:o.amount,status:o.notes.shipping_status||"Paid",
        shippedAt:o.notes.shipped_at||"",deliveredAt:o.notes.delivered_at||"",tracking:o.notes.tracking_number||"",
        trackingEmailSentAt:o.notes.tracking_email_sent_at||"",name:o.notes.name||"",email:o.notes.email||"",
        phone:o.notes.phone||"",address:o.notes.address||"",city:o.notes.city||"",state:o.notes.state||"",pin:o.notes.pin||"",
        product:o.notes.product||""
      }));

    let manualOrders = [];
    try {
      const r = await fetch(new URL("/api/manual-orders", "https://" + req.headers.host), {
        headers: {"x-admin-key": req.headers["x-admin-key"]}
      });
      if (r.ok) {
        const d = await r.json();
        manualOrders = (d.orders || []).map(o => ({...o,type:"manual"}));
      }
    } catch (_) {}

    return res.status(200).json({ orders:[...manualOrders,...paidOrders] });
  } catch (error) {
    console.error("Could not load orders:",error);
    return res.status(500).json({ error:"Could not load orders." });
  }
};