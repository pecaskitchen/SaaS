import { requireAuth } from '../_shared/auth.js';
import { ensureCrmSchema, normalizePhone } from '../_shared/crm.js';
import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { resolveTenantId } from '../_shared/tenant.js';

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))];
}

function mapCustomer(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name || '',
    phone: row.phone || '',
    address: row.address || '',
    neighborhood: row.neighborhood || '',
    sector: row.sector || '',
    tags: parseJson(row.tags_json, []),
    notes: row.notes || '',
    orderCount: Number(row.order_count || 0),
    totalSpent: Number(row.total_spent || 0),
    lastOrderId: row.last_order_id || null,
    lastOrderNumber: row.last_order_number || '',
    lastOrderAtUtc: row.last_order_at_utc || '',
    updatedAtUtc: row.updated_at_utc || '',
  };
}

async function requireCrmAccess(request, env) {
  // Rediseno de roles: 'manager' tambien ve el modulo Clientes.
  return requireAuth(request, env, ['admin', 'manager', 'orders', 'platform_admin']);
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const auth = await requireCrmAccess(request, env);
    if (!auth.ok) return auth.response;
    await ensureCrmSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const url = new URL(request.url);
    const q = String(url.searchParams.get('q') || '').trim();
    const customerId = Number(url.searchParams.get('customer_id') || 0);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 80)));
    const db = requireDb(env);

    if (customerId) {
      const customer = await db.prepare(`SELECT * FROM crm_customers WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, customerId).first();
      if (!customer) return jsonResponse({ ok: false, error: 'Cliente no encontrado.' }, 404);
      const orders = await db.prepare(`
        SELECT id, order_number, status, branch_name, total, order_source, payment_method, payment_status, created_at_utc, created_at_monterrey
        FROM orders
        WHERE tenant_id = ? AND (
          (? != '' AND replace(replace(replace(customer_phone, ' ', ''), '+', ''), '-', '') = ?)
          OR lower(customer_name) = lower(?)
        )
        ORDER BY created_at_utc DESC
        LIMIT 30
      `).bind(tenantId, customer.phone || '', normalizePhone(customer.phone), customer.name || '').all();
      return jsonResponse({ ok: true, customer: mapCustomer(customer), orders: orders.results || [] });
    }

    const like = `%${q.toLowerCase()}%`;
    const result = q
      ? await db.prepare(`
          SELECT * FROM crm_customers
          WHERE tenant_id = ? AND (
            lower(name) LIKE ? OR phone LIKE ? OR lower(address) LIKE ? OR lower(notes) LIKE ?
          )
          ORDER BY updated_at_utc DESC
          LIMIT ?
        `).bind(tenantId, like, `%${normalizePhone(q)}%`, like, like, limit).all()
      : await db.prepare(`
          SELECT * FROM crm_customers
          WHERE tenant_id = ?
          ORDER BY updated_at_utc DESC
          LIMIT ?
        `).bind(tenantId, limit).all();

    return jsonResponse({ ok: true, customers: (result.results || []).map(mapCustomer) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar clientes.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const auth = await requireCrmAccess(request, env);
    if (!auth.ok) return auth.response;
    await ensureCrmSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const body = await readJson(request);
    const id = Number(body.id || 0);
    if (!id) return jsonResponse({ ok: false, error: 'Falta id del cliente.' }, 400);
    const tags = cleanTags(body.tags);
    await requireDb(env).prepare(`
      UPDATE crm_customers
      SET name = ?, phone = ?, address = ?, neighborhood = ?, sector = ?, tags_json = ?, notes = ?, updated_at_utc = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(
      String(body.name || '').trim() || 'Cliente',
      normalizePhone(body.phone || ''),
      String(body.address || '').trim(),
      String(body.neighborhood || '').trim(),
      String(body.sector || '').trim(),
      JSON.stringify(tags),
      String(body.notes || '').trim(),
      new Date().toISOString(),
      tenantId,
      id,
    ).run();
    const row = await requireDb(env).prepare(`SELECT * FROM crm_customers WHERE tenant_id = ? AND id = ?`).bind(tenantId, id).first();
    return jsonResponse({ ok: true, customer: mapCustomer(row) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo actualizar cliente.', detail: error.message }, 500);
  }
}
