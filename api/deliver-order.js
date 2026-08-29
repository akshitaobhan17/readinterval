const Razorpay = require("razorpay");

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

async function sendEmail({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html, text })
  });
  if (!response.ok) throw new Error(`Resend error ${response.status}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return res.status(500).json({ error: "Delivery email service is not configured." });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch { return res.status(400).json({ error: "Invalid request." }); }
  const { order_id } = body;
  if (!order_id) return res.status(400).json({ error: "Order ID is required." });

  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.fetch(order_id);
    if (order.status !== "paid" || !order.notes || order.notes.product !== "The Interval Issue 01") return res.status(400).json({ error: "Order is not a paid Interval order." });
    const notes = order.notes;
    if (notes.shipping_status !== "Shipped") return res.status(400).json({ error: "Order must be marked shipped before it can be marked delivered." });
    if (notes.delivered_email_sent_at) return res.status(409).json({ error: "A delivery email has already been sent for this order." });
    const customerEmail = notes.email || "";
    if (!customerEmail) return res.status(400).json({ error: "No customer email is attached to this order." });

    const deliveredAt = new Date().toISOString();
    const customerName = notes.name || "there";
    await sendEmail({
      to: customerEmail,
      subject: "Your Interval has arrived",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px;margin-bottom:8px">Your Interval has arrived.</h1><p>Hi ${escapeHtml(customerName)},</p><p>Your copy of <strong>The Interval — Issue 01</strong> has arrived.</p><p>Hope it finds you at the right moment.</p><p>Thanks for being one of the first to get Issue 01.</p><p>— The Interval</p></div>`,
      text: `Your Interval has arrived.\n\nHi ${customerName},\n\nYour copy of The Interval — Issue 01 has arrived.\n\nHope it finds you at the right moment.\n\nThanks for being one of the first to get Issue 01.\n\n— The Interval`
    });

    await razorpay.orders.edit(order_id, { notes: { ...notes, shipping_status: "Delivered", delivered_at: deliveredAt, delivered_email_sent_at: deliveredAt } });
    return res.status(200).json({ delivered: true });
  } catch (error) {
    console.error("Could not mark order delivered:", error);
    return res.status(500).json({ error: "Could not send the delivery email." });
  }
};
