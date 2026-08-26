const Razorpay = require("razorpay");

const PRICE_PAISE = 44900;
const SHIPPING_PAISE = 0;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay is not configured." });
  }

  const total = PRICE_PAISE + SHIPPING_PAISE;
  if (total < 100) return res.status(400).json({ error: "Invalid order amount." });

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const receipt = "interval-01-" + Date.now();

    const order = await razorpay.orders.create({
      amount: total,
      currency: "INR",
      receipt,
      notes: {
        product: "The Interval Issue 01",
        name: String(body.name || "").slice(0, 200),
        email: String(body.email || "").slice(0, 200),
        phone: String(body.phone || "").slice(0, 50),
        address: String(body.address || "").slice(0, 500),
        city: String(body.city || "").slice(0, 100),
        state: String(body.state || "").slice(0, 100),
        pin: String(body.pin || "").slice(0, 20)
      }
    });

    return res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      price_paise: PRICE_PAISE,
      shipping_paise: SHIPPING_PAISE
    });
  } catch (error) {
    const status = error && (error.statusCode || error.status) === 401 ? 401 : 500;
    return res.status(status).json({ error: "Could not create the Razorpay order." });
  }
};
