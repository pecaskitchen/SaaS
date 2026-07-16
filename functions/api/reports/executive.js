import { requireAuth } from '../_shared/auth.js';
import { jsonResponse, requireDb } from '../_shared/http.js';
import { ensureOrderArchiveColumns } from '../_shared/orderColumns.js';
import { resolveTenantId } from '../_shared/tenant.js';

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function startDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

// Dia calendario actual EN LA ZONA HORARIA DEL NEGOCIO (Monterrey), no en UTC.
// "Ventas de hoy" debe ser el dia natural del local; una ventana de "ultimas
// 24h UTC" arrastraba pedidos de ayer por la tarde (Monterrey es UTC-6).
function todayMonterrey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Un pedido "activo" no fue eliminado/archivado ni marcado para excluir.
const ACTIVE_ORDER = `deleted_at_utc IS NULL AND archived_at_utc IS NULL AND COALESCE(exclude_from_reports, 0) = 0`;
// Un pedido cancelado no representa dinero cobrado: no debe sumar como venta.
const NOT_CANCELLED = `status NOT IN ('cancelled', 'canceled')`;

async function tableExists(db, tableName) {
  const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(tableName).first();
  return Boolean(row);
}

export async function onRequestGet({ request, env }) {
  try {
    // Rediseno de roles: dashboard ejecutivo tambien visible para 'manager'
    // y el rol nuevo 'reports' (solo lectura).
    const auth = await requireAuth(request, env, ['admin', 'manager', 'reports', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    if (!(await tableExists(db, 'orders'))) {
      return jsonResponse({ ok: true, summary: {}, salesByDay: [], topProducts: [], paymentMethods: [], orderSources: [] });
    }
    // El helper compartido garantiza (y cachea por isolate) las columnas de
    // archivo + payment_method/payment_status/order_source, asi que ya no
    // hacen falta los columnExists individuales (antes: 6 PRAGMAs por request).
    await ensureOrderArchiveColumns(db);
    const hasOrderItems = await tableExists(db, 'order_items');

    const url = new URL(request.url);
    const days = Math.min(120, Math.max(1, Number(url.searchParams.get('days') || 30)));
    const from = startDate(days);

    // sales/orders excluyen cancelados (no es dinero cobrado); cancelled se
    // cuenta aparte para poder mostrar cuantos se cancelaron.
    const summary = await db.prepare(`
      SELECT
        SUM(CASE WHEN ${NOT_CANCELLED} THEN 1 ELSE 0 END) AS orders,
        COALESCE(SUM(CASE WHEN ${NOT_CANCELLED} THEN total ELSE 0 END), 0) AS sales,
        SUM(CASE WHEN status IN ('cancelled', 'canceled') THEN 1 ELSE 0 END) AS cancelled
      FROM orders
      WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND created_at_utc >= ?
    `).bind(tenantId, from).first();

    // Ventas del dia natural de Monterrey (lo que muestra "Ventas de hoy" en
    // Inicio). Se filtra por created_at_monterrey, no por la ventana UTC.
    const today = await db.prepare(`
      SELECT
        SUM(CASE WHEN ${NOT_CANCELLED} THEN 1 ELSE 0 END) AS orders,
        COALESCE(SUM(CASE WHEN ${NOT_CANCELLED} THEN total ELSE 0 END), 0) AS sales
      FROM orders
      WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND SUBSTR(created_at_monterrey, 1, 10) = ?
    `).bind(tenantId, todayMonterrey()).first();

    const salesByDay = await db.prepare(`
      SELECT SUBSTR(created_at_monterrey, 1, 10) AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
      FROM orders
      WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND ${NOT_CANCELLED} AND created_at_utc >= ?
      GROUP BY day
      ORDER BY day ASC
    `).bind(tenantId, from).all().then((result) => result.results || []);

    const topProducts = hasOrderItems ? await db.prepare(`
      SELECT product_name AS name, SUM(quantity) AS quantity, SUM(line_total) AS sales
      FROM order_items
      WHERE tenant_id = ? AND order_id IN (
        SELECT id FROM orders WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND ${NOT_CANCELLED} AND created_at_utc >= ?
      )
      GROUP BY product_name
      ORDER BY quantity DESC, sales DESC
      LIMIT 10
    `).bind(tenantId, tenantId, from).all().then((result) => result.results || []).catch(() => []) : [];

    const paymentMethods = await db.prepare(`
      SELECT COALESCE(payment_method, 'Sin registrar') AS name, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
      FROM orders
      WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND ${NOT_CANCELLED} AND created_at_utc >= ?
      GROUP BY name
      ORDER BY sales DESC
    `).bind(tenantId, from).all().then((result) => result.results || []);

    const orderSources = await db.prepare(`
      SELECT COALESCE(order_source, 'online') AS name, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
      FROM orders
      WHERE tenant_id = ? AND ${ACTIVE_ORDER} AND ${NOT_CANCELLED} AND created_at_utc >= ?
      GROUP BY name
      ORDER BY orders DESC
    `).bind(tenantId, from).all().then((result) => result.results || []);

    const summaryOrders = Number(summary?.orders || 0);
    const summarySales = Number(summary?.sales || 0);
    return jsonResponse({
      ok: true,
      range: { days, from: dateOnly(from), to: dateOnly(new Date().toISOString()) },
      summary: {
        orders: summaryOrders,
        sales: summarySales,
        averageTicket: summaryOrders > 0 ? Math.round(summarySales / summaryOrders) : 0,
        cancelled: Number(summary?.cancelled || 0),
      },
      today: {
        orders: Number(today?.orders || 0),
        sales: Number(today?.sales || 0),
        date: todayMonterrey(),
      },
      salesByDay,
      topProducts,
      paymentMethods,
      orderSources,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar dashboard ejecutivo.', detail: error.message }, 500);
  }
}

