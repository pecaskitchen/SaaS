import { nowIso, requireDb } from './http.js';

export const RECEIVABLE_STATUSES = ['active', 'paid', 'overdue', 'cancelled', 'written_off'];
export const RECEIVABLE_TYPES = ['credit', 'layaway'];

export function normalizeAmount(value) {
  const number = Math.round(Number(value || 0));
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
}

export function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function publicReceivable(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id || '',
    orderNumber: row.order_number || '',
    customerId: row.customer_id || null,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    saleType: row.sale_type || 'credit',
    status: row.status || 'active',
    principalAmount: Number(row.principal_amount || 0),
    downPaymentAmount: Number(row.down_payment_amount || 0),
    paidAmount: Number(row.paid_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    currency: row.currency || 'MXN',
    dueDate: row.due_date || '',
    nextPaymentDate: row.next_payment_date || '',
    reservedUntilDate: row.reserved_until_date || '',
    deliveredAtUtc: row.delivered_at_utc || '',
    notes: row.notes || '',
    createdByName: row.created_by_name || '',
    paidAtUtc: row.paid_at_utc || '',
    cancelledAtUtc: row.cancelled_at_utc || '',
    cancelledReason: row.cancelled_reason || '',
    createdAtUtc: row.created_at_utc || '',
    updatedAtUtc: row.updated_at_utc || '',
  };
}

export function publicReceivablePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    receivableId: row.receivable_id,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || '',
    branchId: row.branch_id || '',
    branchName: row.branch_name || '',
    paidAtUtc: row.paid_at_utc || '',
    receivedByName: row.received_by_name || '',
    notes: row.notes || '',
    status: row.status || 'posted',
    voidedAtUtc: row.voided_at_utc || '',
    voidedByName: row.voided_by_name || '',
    voidReason: row.void_reason || '',
    createdAtUtc: row.created_at_utc || '',
    updatedAtUtc: row.updated_at_utc || '',
  };
}

export async function ensureReceivablesSchema(env) {
  const db = requireDb(env);
  await db.prepare(`CREATE TABLE IF NOT EXISTS receivables (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT,
    order_number TEXT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    sale_type TEXT NOT NULL DEFAULT 'credit',
    status TEXT NOT NULL DEFAULT 'active',
    principal_amount INTEGER NOT NULL DEFAULT 0,
    down_payment_amount INTEGER NOT NULL DEFAULT 0,
    paid_amount INTEGER NOT NULL DEFAULT 0,
    balance_amount INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'MXN',
    due_date TEXT,
    next_payment_date TEXT,
    reserved_until_date TEXT,
    delivered_at_utc TEXT,
    notes TEXT,
    created_by_user_id TEXT,
    created_by_name TEXT,
    paid_at_utc TEXT,
    cancelled_at_utc TEXT,
    cancelled_reason TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS receivable_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    receivable_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    branch_id TEXT,
    branch_name TEXT,
    paid_at_utc TEXT NOT NULL,
    received_by_user_id TEXT,
    received_by_name TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'posted',
    voided_at_utc TEXT,
    voided_by_user_id TEXT,
    voided_by_name TEXT,
    void_reason TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_receivables_tenant_status
    ON receivables (tenant_id, status, due_date)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_receivables_tenant_customer
    ON receivables (tenant_id, customer_id, customer_phone)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_receivables_order
    ON receivables (tenant_id, order_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable
    ON receivable_payments (tenant_id, receivable_id, status, paid_at_utc)`).run();
}

export async function ensureOrderReceivableColumns(env) {
  try {
    const db = requireDb(env);
    const info = await db.prepare(`PRAGMA table_info(orders)`).all();
    const columns = new Set((info.results || []).map((row) => row.name));
    if (!columns.has('receivable_id')) await db.prepare(`ALTER TABLE orders ADD COLUMN receivable_id TEXT`).run();
    if (!columns.has('payment_plan_status')) await db.prepare(`ALTER TABLE orders ADD COLUMN payment_plan_status TEXT`).run();
  } catch {
    // orders may not exist yet in a fresh tenant.
  }
}

export function nextReceivableStatus(row, paidAmount) {
  if (['cancelled', 'written_off'].includes(row.status)) return row.status;
  const principal = normalizeAmount(row.principal_amount);
  const balance = Math.max(0, principal - normalizeAmount(paidAmount));
  if (balance <= 0) return 'paid';
  const dueDate = normalizeText(row.due_date);
  if (dueDate && dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'active';
}

export async function recalculateReceivable(env, tenantId, receivableId) {
  const db = requireDb(env);
  const row = await db.prepare(`SELECT * FROM receivables WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, receivableId).first();
  if (!row) return null;

  const sums = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS paid_amount
    FROM receivable_payments
    WHERE tenant_id = ? AND receivable_id = ? AND status = 'posted'
  `).bind(tenantId, receivableId).first();

  const paidAmount = normalizeAmount(sums?.paid_amount);
  const principalAmount = normalizeAmount(row.principal_amount);
  const balanceAmount = Math.max(0, principalAmount - paidAmount);
  const status = nextReceivableStatus(row, paidAmount);
  const paidAtUtc = status === 'paid' ? nowIso() : null;

  await db.prepare(`
    UPDATE receivables
    SET paid_amount = ?,
        balance_amount = ?,
        status = ?,
        paid_at_utc = CASE WHEN ? = 'paid' THEN COALESCE(paid_at_utc, ?) ELSE NULL END,
        updated_at_utc = ?
    WHERE tenant_id = ? AND id = ?
  `).bind(paidAmount, balanceAmount, status, status, paidAtUtc, nowIso(), tenantId, receivableId).run();

  const updated = await db.prepare(`SELECT * FROM receivables WHERE tenant_id = ? AND id = ?`)
    .bind(tenantId, receivableId).first();
  return publicReceivable(updated);
}

export async function loadReceivablePayments(env, tenantId, receivableId) {
  const db = requireDb(env);
  const rows = await db.prepare(`
    SELECT *
    FROM receivable_payments
    WHERE tenant_id = ? AND receivable_id = ?
    ORDER BY paid_at_utc DESC, created_at_utc DESC
  `).bind(tenantId, receivableId).all();
  return (rows.results || []).map(publicReceivablePayment);
}

export function actorFromSession(session) {
  return {
    userId: session?.userId || '',
    name: session?.name || session?.email || session?.role || '',
  };
}
