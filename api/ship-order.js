const Razorpay = require("razorpay");

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendEmail({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html, text })
  });
  if (!response.ok) throw new Error(`Resend error ${response.status}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { order_id, tracking_number } = body;
  if (!order_id || !tracking_number) return res.status(400).json({ error: "Order ID and tracking number are required." });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return res.status(500).json({ error: "Shipping email service is not configured." });
  }

  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.fetch(order_id);
    if (order.status !== "paid" || !order.notes || order.notes.product !== "The Interval Issue 01") {
      return res.status(400).json({ error: "Order is not a paid Interval order." });
    }

    const notes = order.notes || {};
    if (notes.tracking_email_sent_at) {
      return res.status(409).json({ error: "A shipping email has already been sent for this order." });
    }
    const customerEmail = notes.email || "";
    if (!customerEmail) return res.status(400).json({ error: "No customer email is attached to this order." });

    const tracking = String(tracking_number).trim().slice(0, 100);
    const shippedAt = new Date().toISOString();
    const customerName = notes.name || "there";

    await sendEmail({
      to: customerEmail,
      subject: "Your Interval order is on its way",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px;margin-bottom:8px">Your Interval is on its way.</h1><p>Hi ${escapeHtml(customerName)},</p><p>Your copy of <strong>The Interval — Issue 01</strong> has been posted.</p><div style="border:2px solid #111;padding:18px;margin:24px 0"><p style="margin:0"><strong>Tracking number:</strong> ${escapeHtml(tracking)}</p><p style="margin:8px 0 0"><strong>Delivery address:</strong> ${escapeHtml([notes.address, notes.city, notes.state, notes.pin].filter(Boolean).join(", "))}</p></div><p><a href="https://www.indiapost.gov.in/" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none">Track your parcel</a></p><p>Thanks for being one of the first to get Issue 01.</p><p>— The Interval</p></div>`,
      text: `Your Interval is on its way.\n\nHi ${customerName},\n\nYour copy of The Interval — Issue 01 has been posted.\n\nTracking number: ${tracking}\nDelivery address: ${[notes.address, notes.city, notes.state, notes.pin].filter(Boolean).join(", ")}\n\nTrack your parcel: https://www.indiapost.gov.in/\n\nThanks for being one of the first to get Issue 01.\n\n— The Interval`
    });

    await razorpay.orders.edit(order_id, {
      notes: {
        ...notes,
        shipping_status: "Shipped",
        tracking_number: tracking,
        shipped_at: shippedAt,
        tracking_email_sent_at: shippedAt
      }
    });

    return res.status(200).json({ shipped: true, tracking_number: tracking });
  } catch (error) {
    return res.status(500).json({ error: "Could not send the shipping email." });
  }
};
