const crypto = require("crypto");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === "string") return resolve(req.body);
    if (Buffer.isBuffer(req.body)) return resolve(req.body.toString("utf8"));
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
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
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text
    })
  });
  if (!response.ok) {
    throw new Error(`Email delivery failed (${response.status}): ${await response.text().catch(() => "")}`);
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(500).json({ error: "Webhook is not configured." });

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: "Could not read webhook body." });
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature) return res.status(400).json({ error: "Missing webhook signature." });

  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const supplied = Buffer.from(String(signature), "utf8");
  const generated = Buffer.from(expected, "utf8");
  const valid = supplied.length === generated.length && crypto.timingSafeEqual(supplied, generated);
  if (!valid) return res.status(400).json({ error: "Invalid webhook signature." });

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: "Invalid webhook payload." }); }

  if (event.event === "order.paid") {
    const order = event.payload && event.payload.order && event.payload.order.entity;
    const payment = event.payload && event.payload.payment && event.payload.payment.entity;
    const notes = (order && order.notes) || {};
    const customerName = notes.name || "there";
    const customerEmail = notes.email || "";
    const phone = notes.phone || "";
    const deliveryAddress = [notes.address, notes.city, notes.state, notes.pin].filter(Boolean).join(", ");
    const amount = `₹${((Number(order && order.amount) || 44900) / 100).toFixed(0)}`;
    const paymentId = (payment && payment.id) || "";
    const orderId = (order && order.id) || "";

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: "Your Interval order is in",
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111;line-height:1.6"><h1 style="font-size:30px;margin-bottom:8px">Your Interval order is in.</h1><p>Hi ${escapeHtml(customerName)},</p><p>Thanks for ordering <strong>Issue 01 of The Interval</strong>.</p><div style="border:2px solid #111;padding:18px;margin:24px 0"><p style="margin:0"><strong>Order:</strong> Issue 01 · September 2026</p><p style="margin:6px 0"><strong>Amount:</strong> ${amount}</p><p style="margin:6px 0"><strong>Shipping:</strong> Included</p><p style="margin:6px 0"><strong>Payment ID:</strong> ${escapeHtml(paymentId)}</p><p style="margin:6px 0"><strong>Delivery to:</strong> ${escapeHtml(deliveryAddress)}</p></div><p>We'll dispatch your copy from Mumbai within <strong>3 working days</strong>. Delivery usually takes about a week, depending on the destination.</p><p>We'll email you again when it's on its way.</p><p>— The Interval</p></div>`,
          text: `Your Interval order is in.\n\nHi ${customerName},\n\nThanks for ordering Issue 01 of The Interval.\n\nOrder: Issue 01 · September 2026\nAmount: ${amount}\nShipping: Included\nPayment ID: ${paymentId}\nDelivery to: ${deliveryAddress}\n\nWe'll dispatch your copy from Mumbai within 3 working days. Delivery usually takes about a week, depending on the destination. We'll email you again when it's on its way.\n\n— The Interval`
        });
      }

      await sendEmail({
        to: "readinterval.in@gmail.com",
        subject: `New Interval order · ${customerName} · ${amount}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:700px;color:#111;line-height:1.6"><h1 style="font-size:26px">New Interval order</h1><p><strong>Issue 01 · September 2026</strong></p><p><strong>Amount:</strong> ${amount}<br><strong>Payment ID:</strong> ${escapeHtml(paymentId)}<br><strong>Razorpay Order ID:</strong> ${escapeHtml(orderId)}</p><hr><h2>Customer</h2><p><strong>Name:</strong> ${escapeHtml(customerName)}<br><strong>Email:</strong> ${escapeHtml(customerEmail)}<br><strong>Phone:</strong> ${escapeHtml(phone)}<br><strong>Address:</strong> ${escapeHtml(deliveryAddress)}</p></div>`,
        text: `New Interval order\n\nIssue 01 · September 2026\nAmount: ${amount}\nPayment ID: ${paymentId}\nRazorpay Order ID: ${orderId}\n\nCustomer\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${phone}\nAddress: ${deliveryAddress}`
      });
    }
  }

  return res.status(200).json({ received: true });
};
