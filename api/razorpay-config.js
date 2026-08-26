module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.RAZORPAY_KEY_ID) return res.status(500).json({ error: "Razorpay is not configured." });
  return res.status(200).json({ key_id: process.env.RAZORPAY_KEY_ID });
};
