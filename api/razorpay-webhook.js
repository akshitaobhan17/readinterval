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

  // This endpoint deliberately acknowledges verified order.paid events without
  // sending a second email: the existing payment-verification endpoint already
  // sends the customer and owner emails. The webhook provides a reliable,
  // server-to-server signal that Razorpay considers the order paid, even if the
  // customer's browser disappears after payment.
  if (event.event === "order.paid") {
    console.log("Verified Razorpay order.paid webhook:", event.payload && event.payload.order && event.payload.order.entity && event.payload.order.entity.id);
  }

  return res.status(200).json({ received: true });
};
