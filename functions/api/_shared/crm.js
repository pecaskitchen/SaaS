import { nowIso, requireDb } from './http.js';
import { ensureTenantColumns } from './tenant.js';

export function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function customerKey(customer = {}, order = {}) {
  const phone = normalizePhone(customer.phone || customer.whatsapp || customer.customer_phone);
  if (phone) return `phone:${phone}`;
  const name = String(customer.name || customer.customer_name || 'cliente')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cliente';
  const orderId = String(order.id || order.orderId || '').trim();
  const orderNumber = String(order.orderNumber || order.order_number || '').trim();
  if (orderId || orderNumber) return `order:${orderId || orderNumber}`;
  return `anon:${name}:${Date.now()}`;
}

export async function ensureCrmSchema(env) {
  const db = requireDb(env);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS crm_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      customer_key TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      neighborhood TEXT,
      sector TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      order_count INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      last_order_id INTEGER,
      last_order_number TEXT,
      last_order_at_utc TEXT,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    )
  `).run();
  await ensureTenantColumns(env, ['crm_customers']);
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_customers_tenant_key ON crm_customers(tenant_id, customer_key)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_customers_tenant_updated ON crm_customers(tenant_id, updated_at_utc)`).run();
}

export async function upsertCustomerFromOrder(env, tenantId, { customer = {}, order = {} }) {
  await ensureCrmSchema(env);
  const db = requireDb(env);
  const timestamp = nowIso();
  const key = customerKey(customer, order);
  const phone = normalizePhone(customer.phone || customer.whatsapp || customer.customer_phone);
  const name = String(customer.name || customer.customer_name || 'Cliente').trim() || 'Cliente';
  const address = String(customer.address || customer.customer_address || '').trim();
  const neighborhood = String(customer.neighborhood || '').trim();
  const sector = String(customer.sector || '').trim();
  const total = Number(order.total || 0);

  await db.prepare(`
    INSERT INTO crm_customers (
      tenant_id, customer_key, name, phone, address, neighborhood, sector,
      order_count, total_spent, last_order_id, last_order_number, last_order_at_utc,
      created_at_utc, updated_at_utc
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, customer_key) DO UPDATE SET
      name = excluded.name,
      phone = COALESCE(NULLIF(excluded.phone, ''), crm_customers.phone),
      address = COALESCE(NULLIF(excluded.address, ''), crm_customers.address),
      neighborhood = COALESCE(NULLIF(excluded.neighborhood, ''), crm_customers.neighborhood),
      sector = COALESCE(NULLIF(excluded.sector, ''), crm_customers.sector),
      order_count = crm_customers.order_count + 1,
      total_spent = crm_customers.total_spent + excluded.total_spent,
      last_order_id = excluded.last_order_id,
      last_order_number = excluded.last_order_number,
      last_order_at_utc = excluded.last_order_at_utc,
      updated_at_utc = excluded.updated_at_utc
  `).bind(
    tenantId,
    key,
    name,
    phone,
    address,
    neighborhood,
    sector,
    total,
    order.id || null,
    String(order.orderNumber || order.order_number || ''),
    String(order.createdAtUtc || order.created_at_utc || timestamp),
    timestamp,
    timestamp,
  ).run();
}

export async function rebuildCustomerFromOrderIdentity(env, tenantId, order = {}) {
  await ensureCrmSchema(env);
  const db = requireDb(env);
  const timestamp = nowIso();
  const key = customerKey({
    name: order.customer_name,
    phone: order.customer_phone,
    address: order.customer_address,
  }, order);
  const phone = normalizePhone(order.customer_phone || '');
  const name = String(order.customer_name || '').trim();
  const binds = [tenantId];
  let identitySql = '';

  if (phone) {
    identitySql = `replace(replace(replace(customer_phone, ' ', ''), '+', ''), '-', '') = ?`;
    binds.push(phone);
  } else if (order.id || order.order_number) {
    identitySql = `id = ?`;
    binds.push(order.id || 0);
  } else {
    identitySql = `lower(customer_name) = lower(?)`;
    binds.push(name || 'Cliente');
  }

  const active = await db.prepare(`
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_spent,
      MAX(created_at_utc) AS last_order_at_utc
    FROM orders
    WHERE tenant_id = ?
      AND deleted_at_utc IS NULL
      AND archived_at_utc IS NULL
      AND COALESCE(exclude_from_reports, 0) = 0
      AND ${identitySql}
  `).bind(...binds).first();

  if (!Number(active?.order_count || 0)) {
    await db.prepare(`DELETE FROM crm_customers WHERE tenant_id = ? AND customer_key = ?`).bind(tenantId, key).run();
    return { removed: true };
  }

  const latest = await db.prepare(`
    SELECT id, order_number, customer_name, customer_phone, customer_address, created_at_utc
    FROM orders
    WHERE tenant_id = ?
      AND deleted_at_utc IS NULL
      AND archived_at_utc IS NULL
      AND COALESCE(exclude_from_reports, 0) = 0
      AND ${identitySql}
    ORDER BY created_at_utc DESC, id DESC
    LIMIT 1
  `).bind(...binds).first();

  await db.prepare(`
    UPDATE crm_customers
    SET name = ?,
      phone = ?,
      address = ?,
      order_count = ?,
      total_spent = ?,
      last_order_id = ?,
      last_order_number = ?,
      last_order_at_utc = ?,
      updated_at_utc = ?
    WHERE tenant_id = ? AND customer_key = ?
  `).bind(
    latest?.customer_name || name || 'Cliente',
    normalizePhone(latest?.customer_phone || phone),
    latest?.customer_address || '',
    Number(active.order_count || 0),
    Number(active.total_spent || 0),
    latest?.id || null,
    latest?.order_number || '',
    latest?.created_at_utc || active.last_order_at_utc || '',
    timestamp,
    tenantId,
    key,
  ).run();

  return { removed: false };
}
