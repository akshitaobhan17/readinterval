const { get, put } = require("@vercel/blob");

const PATH = "interval/manual-orders.json";

function authorised(req) {
  return !!process.env.INTERVAL_ADMIN_KEY && req.headers["x-admin-key"] === process.env.INTERVAL_ADMIN_KEY;
}
async function readOrders() {
  try {
    const result = await get(PATH, { access: "private", useCache: false });
    if (!result) return [];
    return JSON.parse(await new Response(result.stream).text() || "[]");
  } catch (error) {
    if (error && (error.statusCode === 404 || error.code === "BLOB_NOT_FOUND")) return [];
    throw error;
  }
}
async function writeOrders(orders) {
  await put(PATH, JSON.stringify(orders, null, 2), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
  });
}
module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  try {
    if (req.method === "GET") return res.status(200).json({ orders: await readOrders() });
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const order = body.order || {};
      if (!order.name || !order.email || !order.address) return res.status(400).json({ error: "Name, email and address are required." });
      const now = new Date().toISOString();
      const clean = {
        id: String(order.id || ("MAN-" + Date.now())),
        date: order.createdAt || now, createdAt: order.createdAt || now, type: "manual",
        name: String(order.name).slice(0,200), email: String(order.email).slice(0,200),
        phone: String(order.phone || "").slice(0,50), product: String(order.product || "The Interval").slice(0,200),
        address: String(order.address).slice(0,500), city: String(order.city || "").slice(0,100),
        state: String(order.state || "").slice(0,100), pin: String(order.pin || "").slice(0,20),
        tracking: String(order.tracking || "").slice(0,100), reason: String(order.reason || "Manual").slice(0,100),
        status: ["Gifted","Shipped","Delivered"].includes(order.status) ? order.status : "Gifted"
      };
      const orders = await readOrders();
      if (orders.some(o => o.id === clean.id)) return res.status(409).json({ error: "That manual order already exists." });
      orders.unshift(clean); await writeOrders(orders);
      return res.status(201).json({ order: clean });
    }
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const orderId = String(body.order_id || "");
      if (!orderId) return res.status(400).json({ error: "Order ID is required." });
      if (body.status && !["Gifted","Shipped","Delivered"].includes(body.status)) return res.status(400).json({ error: "Invalid status." });
      const orders = await readOrders(), index = orders.findIndex(o => o.id === orderId);
      if (index === -1) return res.status(404).json({ error: "Manual order not found." });
      const updated = { ...orders[index] };
      if (body.status) updated.status = body.status;
      if (body.tracking !== undefined) updated.tracking = String(body.tracking || "").slice(0,100);
      if (body.status === "Shipped") { updated.shippedAt = updated.shippedAt || new Date().toISOString(); }
      if (body.status === "Delivered") updated.deliveredAt = updated.deliveredAt || new Date().toISOString();
      orders[index] = updated; await writeOrders(orders);
      return res.status(200).json({ order: updated });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Manual orders error:", error);
    return res.status(500).json({ error: "Could not access manual orders storage." });
  }
};