const crypto = require("crypto");
const Razorpay = require("razorpay");

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
  if (!response.ok) throw new Error(`Email delivery failed (${response.status}): ${await response.text().catch(() => "")}`);
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid request." }); }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: "Missing payment verification fields." });
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(500).json({ error: "Razorpay is not configured." });

  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex");
  const supplied = Buffer.from(String(razorpay_signature), "utf8");
  const generated = Buffer.from(expected, "utf8");
  const valid = supplied.length === generated.length && crypto.timingSafeEqual(supplied, generated);
  if (!valid) return res.status(400).json({ error: "Payment verification failed." });

  let order;
  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    order = await razorpay.orders.fetch(razorpay_order_id);
  } catch (error) {
    console.error("Could not fetch verified Razorpay order:", error);
    return res.status(500).json({ error: "Payment was verified, but the order details could not be retrieved." });
  }

  const notes = order.notes || {};
  const customerName = notes.name || "there";
  const customerEmail = notes.email || "";
  const phone = notes.phone || "";
  const deliveryAddress = [notes.address, notes.city, notes.state, notes.pin].filter(Boolean).join(", ");
  const orderAmount = `₹${((Number(order.amount) || 44900) / 100).toFixed(0)}`;

  let customerEmailSent = false;
  let ownerEmailSent = false;

  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && customerEmail) {
    try {
      await sendEmail({
        to: customerEmail,
        subject: "Your Interval order is in",
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px;margin-bottom:8px">Your Interval order is in.</h1><p>Hi ${escapeHtml(customerName)},</p><p>Thanks for ordering <strong>Issue 01 of The Interval</strong>.</p><div style="border:2px solid #111;padding:18px;margin:24px 0"><p style="margin:0"><strong>Order:</strong> Issue 01 · September 2026</p><p style="margin:6px 0"><strong>Amount:</strong> ${orderAmount}</p><p style="margin:6px 0"><strong>Shipping:</strong> Included</p><p style="margin:6px 0"><strong>Payment ID:</strong> ${escapeHtml(razorpay_payment_id)}</p><p style="margin:6px 0"><strong>Delivery to:</strong> ${escapeHtml(deliveryAddress)}</p></div><p>We'll dispatch your copy from Mumbai within <strong>3 working days</strong>. Delivery usually takes about a week, depending on the destination.</p><p>We'll email you again when it's on its way.</p><p>— The Interval</p></div>`,
        text: `Your Interval order is in.\n\nHi ${customerName},\n\nThanks for ordering Issue 01 of The Interval.\n\nOrder: Issue 01 · September 2026\nAmount: ${orderAmount}\nShipping: Included\nPayment ID: ${razorpay_payment_id}\nDelivery to: ${deliveryAddress}\n\nWe'll dispatch your copy from Mumbai within 3 working days. Delivery usually takes about a week, depending on the destination. We'll email you again when it's on its way.\n\n— The Interval`
      });
      customerEmailSent = true;
    } catch (error) { console.error("Customer confirmation email failed:", error); }
  }

  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    try {
      await sendEmail({
        to: "readinterval.in@gmail.com",
        subject: `New Interval order · ${customerName} · ${orderAmount}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:700px;color:#111;line-height:1.6"><h1 style="font-size:26px">New Interval order</h1><p><strong>Issue 01 · September 2026</strong></p><p><strong>Amount:</strong> ${orderAmount}<br><strong>Payment ID:</strong> ${escapeHtml(razorpay_payment_id)}<br><strong>Razorpay Order ID:</strong> ${escapeHtml(razorpay_order_id)}</p><hr><h2>Customer</h2><p><strong>Name:</strong> ${escapeHtml(customerName)}<br><strong>Email:</strong> ${escapeHtml(customerEmail)}<br><strong>Phone:</strong> ${escapeHtml(phone)}<br><strong>Address:</strong> ${escapeHtml(deliveryAddress)}</p><p><a href="https://dashboard.razorpay.com/app/orders/${encodeURIComponent(razorpay_order_id)}">Open order in Razorpay</a></p></div>`,
        text: `New Interval order\n\nIssue 01 · September 2026\nAmount: ${orderAmount}\nPayment ID: ${razorpay_payment_id}\nRazorpay Order ID: ${razorpay_order_id}\n\nCustomer\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${phone}\nAddress: ${deliveryAddress}`
      });
      ownerEmailSent = true;
    } catch (error) { console.error("Owner order email failed:", error); }
  }

  return res.status(200).json({ verified: true, customer_email_sent: customerEmailSent, owner_email_sent: ownerEmailSent });
};
