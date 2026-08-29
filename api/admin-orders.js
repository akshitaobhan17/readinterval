const Razorpay = require("razorpay");

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay is not configured." });
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const result = await razorpay.orders.all({ count: 100 });
    const orders = (result.items || [])
      .filter(order => order.status === "paid" && order.notes && order.notes.product === "The Interval Issue 01")
      .map(order => ({
        id: order.id,
        date: order.created_at,
        amount: order.amount,
        status: order.notes.shipping_status || "Paid",
        shippedAt: order.notes.shipped_at || "",
        deliveredAt: order.notes.delivered_at || "",
        tracking: order.notes.tracking_number || "",
        trackingEmailSentAt: order.notes.tracking_email_sent_at || "",
        name: order.notes.name || "",
        email: order.notes.email || "",
        phone: order.notes.phone || "",
        address: order.notes.address || "",
        city: order.notes.city || "",
        state: order.notes.state || "",
        pin: order.notes.pin || ""
      }));

    return res.status(200).json({ orders });
  } catch (error) {
    return res.status(500).json({ error: "Could not load orders." });
  }
};
