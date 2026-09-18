const Razorpay = require("razorpay");
const { get } = require("@vercel/blob");

const MANUAL_PATH = "interval/manual-orders.json";

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}

async function loadManualOrders() {
  try {
    const result = await get(MANUAL_PATH, { access: "private", useCache: false });
    if (!result) return [];
    const body = await new Response(result.stream).text();
    const orders = JSON.parse(body || "[]");
    return Array.isArray(orders) ? orders.map(o => ({ ...o, type: "manual" })) : [];
  } catch (error) {
    if (error && (error.statusCode === 404 || error.code === "BLOB_NOT_FOUND")) return [];
    console.error("Could not read manual orders:", error);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });

  try {
    const manualOrders = await loadManualOrders();
    let paidOrders = [];

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
      const result = await razorpay.orders.all({ count: 100 });
      paidOrders = (result.items || [])
        .filter(o => o.status === "paid" && o.notes && o.notes.product === "The Interval Issue 01")
        .map(o => ({
          id: o.id, date: o.created_at, type: "paid", amount: o.amount,
          status: o.notes.shipping_status || "Paid",
          shippedAt: o.notes.shipped_at || "", deliveredAt: o.notes.delivered_at || "",
          tracking: o.notes.tracking_number || "", trackingEmailSentAt: o.notes.tracking_email_sent_at || "",
          name: o.notes.name || "", email: o.notes.email || "", phone: o.notes.phone || "",
          address: o.notes.address || "", city: o.notes.city || "", state: o.notes.state || "",
          pin: o.notes.pin || "", product: o.notes.product || ""
        }));
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json({ orders: [...manualOrders, ...paidOrders] });
  } catch (error) {
    console.error("Could not load orders:", error);
    return res.status(500).json({ error: "Could not load orders.", detail: String(error.message || error) });
  }
};