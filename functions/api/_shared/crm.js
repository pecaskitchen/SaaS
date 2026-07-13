import { nowIso, requireDb } from './http.js';
import { ensureTenantColumns } from './tenant.js';

export function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function customerKey(customer = {}) {
  const phone = normalizePhone(customer.phone || customer.whatsapp || customer.customer_phone);
  if (phone) return `phone:${phone}`;
  const name = String(customer.name || customer.customer_name || 'cliente')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cliente';
  return `name:${name}`;
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
  const key = customerKey(customer);
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
