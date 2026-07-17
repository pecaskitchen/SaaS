import { requireAuth } from './_shared/auth.js';
import { jsonResponse, requireDb } from './_shared/http.js';
import { resolveTenantId } from './_shared/tenant.js';
import { ensureSchema } from './orders.js';

// Historial buscable de pedidos/ventas (admin, gerente, reports). A
// diferencia de /api/orders-dashboard (que muestra la cola del dia), esto
// permite buscar en cualquier rango de fechas y por numero de pedido,
// cliente, telefono o colonia, y ver el detalle completo de cada uno.

function todayMonterrey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function cleanDate(value, fallback) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const auth = await requireAuth(request, env, ['admin', 'manager', 'reports', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    // Garantiza que existan las columnas nuevas (customer_neighborhood,
    // custom_fields_json) aunque aun no se haya creado ningun pedido nuevo
    // desde el deploy. ensureSchema esta cacheado por isolate.
    await ensureSchema(env);
    const url = new URL(request.url);

    const today = todayMonterrey();
    const defaultFrom = new Date(`${today}T12:00:00-06:00`);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
    const from = cleanDate(url.searchParams.get('from'), defaultFrom.toISOString().slice(0, 10));
    const to = cleanDate(url.searchParams.get('to'), today);
    const q = String(url.searchParams.get('q') || '').trim();
    const status = String(url.searchParams.get('status') || 'all').trim();
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200) || 200));

    let sql = `
      SELECT id, order_number, status, customer_name, customer_phone, customer_address, customer_neighborhood,
        customer_notes, custom_fields_json, total, subtotal, payment_method, payment_status, order_source,
        cashier_name, branch_name, created_at_monterrey
      FROM orders
      WHERE tenant_id = ? AND deleted_at_utc IS NULL
        AND SUBSTR(created_at_monterrey, 1, 10) BETWEEN ? AND ?`;
    const binds = [tenantId, from, to];
    if (status !== 'all') { sql += ` AND status = ?`; binds.push(status); }
    if (q) {
      sql += ` AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR customer_neighborhood LIKE ?)`;
      const like = `%${q}%`;
      binds.push(like, like, like, like);
    }
    sql += ` ORDER BY created_at_monterrey DESC LIMIT ?`;
    binds.push(limit);

    const ordersResult = await db.prepare(sql).bind(...binds).all();
    const orders = ordersResult.results || [];

    let items = [];
    if (orders.length) {
      const ids = orders.map((o) => o.id);
      const placeholders = ids.map(() => '?').join(',');
      const itemsResult = await db.prepare(
        `SELECT order_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes
         FROM order_items WHERE tenant_id = ? AND order_id IN (${placeholders}) ORDER BY id ASC`
      ).bind(tenantId, ...ids).all();
      items = itemsResult.results || [];
    }
    const itemsByOrder = new Map();
    for (const item of items) {
      if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
      itemsByOrder.get(item.order_id).push(item);
    }

    const fullOrders = orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) || [] }));
    const totalSales = orders
      .filter((o) => !['cancelled', 'canceled'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    return jsonResponse({
      ok: true,
      range: { from, to },
      count: fullOrders.length,
      totalSales,
      orders: fullOrders,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar el historial.', detail: error.message }, 500);
  }
}
