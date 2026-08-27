const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid request." });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment verification fields." });
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay is not configured." });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  const supplied = Buffer.from(String(razorpay_signature), "utf8");
  const generated = Buffer.from(expected, "utf8");
  const valid = supplied.length === generated.length && crypto.timingSafeEqual(supplied, generated);

  if (!valid) return res.status(400).json({ error: "Payment verification failed." });

  // Email fulfilment is handled by the verified Razorpay order.paid webhook.
  // That keeps confirmation reliable even when the customer closes the Checkout
  // window before the browser handler can finish.
  return res.status(200).json({ verified: true });
};
