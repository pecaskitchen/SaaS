import { resolveTenantId } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';
import { ensureOrderArchiveColumns } from './_shared/orderColumns.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/["\n\r,]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvResponse(filename, columns, rows) {
  const body = '\ufeff' + [columns.join(','), ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','))].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function normalizeDate(value, fallback) {
  const clean = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  return fallback;
}

function todayLocal() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function previousWeekLocal() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function validType(value) {
  const allowed = new Set(['sales_orders','sales_products','source_summary','stock_movements','waste','sold_out','purchase_suggestions','payment_summary','inventory_value','category_sales','branch_summary']);
  return allowed.has(value) ? value : 'sales_orders';
}

async function ensureOrderColumns(env) {
  // Delegado al helper compartido (un solo PRAGMA, cacheado por isolate).
  await ensureOrderArchiveColumns(env.DB);
}

// CORREGIDO: antes leia siempre la key fija 'menu_overrides', mezclando
// la config de sold_out de TODOS los tenants. Ahora se filtra por tenant_id.
async function readMenuOverrides(env, tenantId) {
  try {
    const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ? AND tenant_id = ?`)
      .bind('menu_overrides', tenantId)
      .first();
    return JSON.parse(row?.value_json || '{}');
  } catch {
    return {};
  }
}

// MIGRADO a JWT: antes comparaba contra env.ADMIN_PASSWORD/SUPER_PASSWORD
// (contrasenas globales, mismas para todos los tenants). Ahora exige un
// usuario admin/super/platform_admin valido PARA ESTE tenant.
// IMPORTANTE: no reintroducir el fallback a esas contrasenas globales.
async function auth(request, env) {
  // Rediseno de roles: 'super' se renombra a 'manager', se agrega 'reports'
  // (rol nuevo, de solo lectura) -- ver plan de rediseno de roles/menus.
  return requireAuth(request, env, ['admin', 'manager', 'reports', 'platform_admin']);
}

function branchClause(branchId, column = 'branch_id') {
  if (!branchId || branchId === 'all') return { sql: '', binds: [] };
  return { sql: ` AND COALESCE(${column}, 'dominio') = ?`, binds: [branchId] };
}

// Un pedido cancelado no representa dinero cobrado: no cuenta como venta en
// ningun reporte de ventas. `prefix` permite usar el alias en los JOIN (o./oi.).
function notCancelled(prefix = '') {
  return ` AND ${prefix}status NOT IN ('cancelled', 'canceled')`;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const authResult = await auth(request, env);
    if (!authResult.ok) return authResult.response;
    await ensureOrderColumns(env);

    // NUEVO: se resuelve el tenant_id de la peticion (por hostname o header)
    // y se agrega como filtro OBLIGATORIO en cada consulta de este archivo.
    // Antes ninguna query de reports.js filtraba por tenant_id: cualquier
    // cuenta admin/super podia exportar ventas, stock y mermas de TODOS los
    // negocios del sistema, no solo el propio.
    const tenantId = await resolveTenantId(request, env);

    const url = new URL(request.url);
    const type = validType(url.searchParams.get('type') || 'sales_orders');
    const start = normalizeDate(url.searchParams.get('start'), previousWeekLocal());
    const end = normalizeDate(url.searchParams.get('end'), todayLocal());
    const branchId = String(url.searchParams.get('branchId') || 'all').trim() || 'all';
    const startDateTime = `${start} 00:00:00`;
    const endDateTime = `${end} 23:59:59`;
    const branch = branchClause(branchId);

    if (type === 'sales_orders') {
      const sql = `SELECT created_at_monterrey AS fecha, branch_name AS sucursal, order_source AS origen, order_number AS pedido, status AS estado, customer_name AS cliente, total, payment_method AS metodo_pago, payment_status AS estado_pago FROM orders WHERE tenant_id = ? AND deleted_at_utc IS NULL AND archived_at_utc IS NULL AND COALESCE(exclude_from_reports, 0) = 0${notCancelled()} AND created_at_monterrey BETWEEN ? AND ?${branch.sql} ORDER BY created_at_monterrey DESC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-ventas-pedido-${start}-${end}.csv`, ['fecha','sucursal','origen','pedido','estado','cliente','total','metodo_pago','estado_pago'], result.results || []);
    }

    if (type === 'sales_products') {
      const sql = `SELECT o.created_at_monterrey AS fecha, o.branch_name AS sucursal, o.order_source AS origen, oi.product_name AS producto, oi.category AS categoria, SUM(oi.quantity) AS cantidad, SUM(oi.line_total) AS venta_total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.tenant_id = ? AND o.deleted_at_utc IS NULL AND o.archived_at_utc IS NULL AND COALESCE(o.exclude_from_reports, 0) = 0${notCancelled('o.')} AND o.created_at_monterrey BETWEEN ? AND ?${branch.sql.replace('branch_id','o.branch_id')} GROUP BY fecha, sucursal, origen, producto, categoria ORDER BY fecha DESC, producto ASC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-ventas-producto-${start}-${end}.csv`, ['fecha','sucursal','origen','producto','categoria','cantidad','venta_total'], result.results || []);
    }

    if (type === 'source_summary') {
      const sql = `SELECT SUBSTR(created_at_monterrey, 1, 10) AS fecha, branch_name AS sucursal, order_source AS origen, COUNT(*) AS pedidos, SUM(total) AS venta_total FROM orders WHERE tenant_id = ? AND deleted_at_utc IS NULL AND archived_at_utc IS NULL AND COALESCE(exclude_from_reports, 0) = 0${notCancelled()} AND created_at_monterrey BETWEEN ? AND ?${branch.sql} GROUP BY fecha, sucursal, origen ORDER BY fecha DESC, sucursal ASC, origen ASC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-online-vs-caja-${start}-${end}.csv`, ['fecha','sucursal','origen','pedidos','venta_total'], result.results || []);
    }

    if (type === 'stock_movements') {
      const stockBranch = branchClause(branchId, 'm.branch_id');
      const sql = `SELECT m.created_at_monterrey AS fecha, m.branch_name AS sucursal, i.name AS ingrediente, m.movement_type AS tipo_movimiento, m.quantity AS cantidad, m.stock_before, m.stock_after, m.reason AS motivo, m.reported_by AS usuario, m.reported_role AS rol, m.source_type, m.source_id FROM stock_movements m JOIN items i ON i.id = m.item_id WHERE m.tenant_id = ? AND m.created_at_monterrey BETWEEN ? AND ?${stockBranch.sql} ORDER BY m.created_at_monterrey DESC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...stockBranch.binds).all();
      return csvResponse(`pecas-movimientos-stock-${start}-${end}.csv`, ['fecha','sucursal','ingrediente','tipo_movimiento','cantidad','stock_before','stock_after','motivo','usuario','rol','source_type','source_id'], result.results || []);
    }

    if (type === 'waste') {
      const wasteBranch = branchClause(branchId, 'w.branch_id');
      const sql = `SELECT w.created_at_monterrey AS fecha, w.branch_name AS sucursal, i.name AS ingrediente, w.quantity AS cantidad, w.reason AS motivo, w.status AS estado, w.reported_by AS reportado_por, w.approved_by AS aprobado_por FROM waste_requests w JOIN items i ON i.id = w.item_id WHERE w.tenant_id = ? AND w.created_at_monterrey BETWEEN ? AND ?${wasteBranch.sql} ORDER BY w.created_at_monterrey DESC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...wasteBranch.binds).all();
      return csvResponse(`pecas-mermas-${start}-${end}.csv`, ['fecha','sucursal','ingrediente','cantidad','motivo','estado','reportado_por','aprobado_por'], result.results || []);
    }

    if (type === 'purchase_suggestions') {
      const selectedBranch = branchId === 'all' ? 'dominio' : branchId;
      const sql = `SELECT ? AS sucursal, COALESCE(s.name, 'Sin proveedor') AS proveedor, i.name AS ingrediente, COALESCE(bs.current_stock, i.current_stock, 0) AS stock_actual, i.min_stock AS minimo, i.max_stock AS maximo, CASE WHEN COALESCE(bs.current_stock, i.current_stock, 0) < i.min_stock THEN MAX(i.max_stock - COALESCE(bs.current_stock, i.current_stock, 0), 0) ELSE 0 END AS sugerido_comprar, u.code AS unidad FROM items i JOIN stock_units u ON u.id = i.unit_id LEFT JOIN inventory_branch_stock bs ON bs.item_id = i.id AND bs.branch_id = ? AND bs.tenant_id = i.tenant_id LEFT JOIN stock_suppliers s ON s.id = i.primary_supplier_id AND s.tenant_id = i.tenant_id WHERE i.tenant_id = ? AND i.is_active = 1 AND COALESCE(bs.current_stock, i.current_stock, 0) < i.min_stock ORDER BY proveedor ASC, ingrediente ASC`;
      const result = await env.DB.prepare(sql).bind(selectedBranch, selectedBranch, tenantId).all();
      return csvResponse(`pecas-compra-sugerida-${selectedBranch}-${start}-${end}.csv`, ['sucursal','proveedor','ingrediente','stock_actual','minimo','maximo','sugerido_comprar','unidad'], result.results || []);
    }

    if (type === 'payment_summary') {
      const sql = `SELECT SUBSTR(created_at_monterrey, 1, 10) AS fecha, branch_name AS sucursal, COALESCE(payment_method, 'Sin registrar') AS metodo_pago, COALESCE(payment_status, 'Sin registrar') AS estado_pago, COUNT(*) AS pedidos, SUM(total) AS venta_total FROM orders WHERE tenant_id = ? AND deleted_at_utc IS NULL AND archived_at_utc IS NULL AND COALESCE(exclude_from_reports, 0) = 0${notCancelled()} AND created_at_monterrey BETWEEN ? AND ?${branch.sql} GROUP BY fecha, sucursal, metodo_pago, estado_pago ORDER BY fecha DESC, sucursal ASC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-pagos-${start}-${end}.csv`, ['fecha','sucursal','metodo_pago','estado_pago','pedidos','venta_total'], result.results || []);
    }

    if (type === 'category_sales') {
      const sql = `SELECT SUBSTR(o.created_at_monterrey, 1, 10) AS fecha, o.branch_name AS sucursal, oi.category AS categoria, SUM(oi.quantity) AS unidades, SUM(oi.line_total) AS venta_total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.tenant_id = ? AND o.deleted_at_utc IS NULL AND o.archived_at_utc IS NULL AND COALESCE(o.exclude_from_reports, 0) = 0${notCancelled('o.')} AND o.created_at_monterrey BETWEEN ? AND ?${branch.sql.replace('branch_id','o.branch_id')} GROUP BY fecha, sucursal, categoria ORDER BY fecha DESC, venta_total DESC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-ventas-categoria-${start}-${end}.csv`, ['fecha','sucursal','categoria','unidades','venta_total'], result.results || []);
    }

    if (type === 'branch_summary') {
      const sql = `SELECT branch_name AS sucursal, COUNT(*) AS pedidos, SUM(total) AS venta_total, SUM(CASE WHEN order_source = 'online' THEN 1 ELSE 0 END) AS pedidos_online, SUM(CASE WHEN order_source = 'cashier' THEN 1 ELSE 0 END) AS pedidos_caja, AVG(total) AS ticket_promedio FROM orders WHERE tenant_id = ? AND deleted_at_utc IS NULL AND archived_at_utc IS NULL AND COALESCE(exclude_from_reports, 0) = 0${notCancelled()} AND created_at_monterrey BETWEEN ? AND ?${branch.sql} GROUP BY branch_name ORDER BY venta_total DESC`;
      const result = await env.DB.prepare(sql).bind(tenantId, startDateTime, endDateTime, ...branch.binds).all();
      return csvResponse(`pecas-resumen-sucursales-${start}-${end}.csv`, ['sucursal','pedidos','venta_total','pedidos_online','pedidos_caja','ticket_promedio'], result.results || []);
    }

    if (type === 'inventory_value') {
      const selectedBranch = branchId === 'all' ? 'dominio' : branchId;
      const sql = `SELECT ? AS sucursal, i.name AS ingrediente, u.code AS unidad, COALESCE(bs.current_stock, i.current_stock, 0) AS stock_actual, i.purchase_unit_quantity AS cantidad_presentacion, i.purchase_price AS precio_presentacion, CASE WHEN COALESCE(i.purchase_unit_quantity, 0) > 0 THEN ROUND(COALESCE(bs.current_stock, i.current_stock, 0) * COALESCE(i.purchase_price, 0) / i.purchase_unit_quantity, 2) ELSE 0 END AS valor_estimado FROM items i LEFT JOIN stock_units u ON u.id = i.unit_id LEFT JOIN inventory_branch_stock bs ON bs.item_id = i.id AND bs.branch_id = ? AND bs.tenant_id = i.tenant_id WHERE i.tenant_id = ? AND i.is_active = 1 ORDER BY valor_estimado DESC, ingrediente ASC`;
      const result = await env.DB.prepare(sql).bind(selectedBranch, selectedBranch, tenantId).all();
      return csvResponse(`pecas-inventario-valorizado-${selectedBranch}.csv`, ['sucursal','ingrediente','unidad','stock_actual','cantidad_presentacion','precio_presentacion','valor_estimado'], result.results || []);
    }

    if (type === 'sold_out') {
      const overrides = await readMenuOverrides(env, tenantId);
      const settings = overrides.branchSettings || { branches: [] };
      const rows = [];
      for (const branch of settings.branches || []) {
        if (branchId !== 'all' && branch.id !== branchId) continue;
        const soldOut = branch.soldOut || {};
        Object.keys(soldOut).forEach((product_id) => {
          if (soldOut[product_id]) rows.push({ sucursal: branch.name || branch.id, product_id, agotado: 1 });
        });
      }
      return csvResponse(`pecas-agotados-${start}-${end}.csv`, ['sucursal','product_id','agotado'], rows);
    }

    return jsonResponse({ ok: false, error: 'Tipo de reporte no soportado.' }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo generar reporte.', detail: error.message }, 500);
  }
}

