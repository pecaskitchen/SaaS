import { requireAuth } from './_shared/auth.js';
import { ensureCrmSchema } from './_shared/crm.js';
import { jsonResponse, nowIso, readJson, requireDb } from './_shared/http.js';
import { resolveTenantId } from './_shared/tenant.js';
import {
  actorFromSession,
  ensureOrderReceivableColumns,
  ensureReceivablesSchema,
  loadReceivablePayments,
  normalizeAmount,
  normalizePhone,
  normalizeText,
  publicReceivable,
  RECEIVABLE_STATUSES,
  RECEIVABLE_TYPES,
  recalculateReceivable,
} from './_shared/receivables.js';

const READ_ROLES = ['admin', 'manager', 'orders', 'cashier', 'reports', 'platform_admin'];
const WRITE_ROLES = ['admin', 'manager', 'orders', 'cashier', 'platform_admin'];
const ADMIN_ROLES = ['admin', 'manager', 'platform_admin'];

function parseTags(value) {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function ensureCustomer(env, tenantId, body) {
  await ensureCrmSchema(env);
  const db = requireDb(env);
  const customerId = Number(body.customerId || body.customer_id || 0);
  const name = normalizeText(body.customerName || body.customer_name || body.name) || 'Cliente';
  const phone = normalizePhone(body.customerPhone || body.customer_phone || body.phone);

  if (customerId) {
    const existing = await db.prepare(`SELECT * FROM crm_customers WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, customerId).first();
    if (existing) return { id: existing.id, name: existing.name || name, phone: existing.phone || phone };
  }

  if (phone) {
    const existing = await db.prepare(`SELECT * FROM crm_customers WHERE tenant_id = ? AND phone = ? LIMIT 1`)
      .bind(tenantId, phone).first();
    if (existing) {
      const tags = new Set(parseTags(existing.tags_json));
      tags.add('credito');
      await db.prepare(`
        UPDATE crm_customers
        SET name = COALESCE(NULLIF(name, ''), ?),
            tags_json = ?,
            updated_at_utc = ?
        WHERE tenant_id = ? AND id = ?
      `).bind(name, JSON.stringify([...tags]), nowIso(), tenantId, existing.id).run();
      return { id: existing.id, name: existing.name || name, phone };
    }
  }

  const now = nowIso();
  const customerKey = phone ? `phone:${phone}` : `credit:${crypto.randomUUID()}`;
  const inserted = await db.prepare(`
    INSERT INTO crm_customers (
      tenant_id, customer_key, name, phone, address, neighborhood, sector, tags_json, notes,
      order_count, total_spent, last_order_id, last_order_number, last_order_at_utc,
      created_at_utc, updated_at_utc
    )
    VALUES (?, ?, ?, ?, '', '', '', ?, '', 0, 0, NULL, '', '', ?, ?)
    RETURNING id, name, phone
  `).bind(tenantId, customerKey, name, phone, JSON.stringify(['credito']), now, now).first();

  return { id: inserted.id, name: inserted.name, phone: inserted.phone || phone };
}

async function orderDefaults(env, tenantId, orderId) {
  const id = normalizeText(orderId);
  if (!id) return null;
  try {
    const order = await requireDb(env).prepare(`
      SELECT id, order_number, customer_name, customer_phone, total
      FROM orders
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
    `).bind(tenantId, id).first();
    return order || null;
  } catch {
    return null;
  }
}

function buildStatusFilter(value) {
  const status = normalizeText(value);
  if (!status || status === 'all') return null;
  if (!RECEIVABLE_STATUSES.includes(status)) return null;
  return status;
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, READ_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    const url = new URL(request.url);
    const id = normalizeText(url.searchParams.get('id'));
    const customerId = Number(url.searchParams.get('customer_id') || 0);
    const q = normalizeText(url.searchParams.get('q')).toLowerCase();
    const status = buildStatusFilter(url.searchParams.get('status'));
    const overdueOnly = url.searchParams.get('overdue') === '1';
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

    if (id) {
      const row = await db.prepare(`SELECT * FROM receivables WHERE tenant_id = ? AND id = ? LIMIT 1`)
        .bind(tenantId, id).first();
      if (!row) return jsonResponse({ ok: false, error: 'Cuenta por cobrar no encontrada.' }, 404);
      const payments = await loadReceivablePayments(env, tenantId, id);
      return jsonResponse({ ok: true, receivable: publicReceivable(row), payments });
    }

    const where = ['tenant_id = ?'];
    const values = [tenantId];
    if (status) {
      where.push('status = ?');
      values.push(status);
    }
    if (customerId) {
      where.push('customer_id = ?');
      values.push(customerId);
    }
    if (q) {
      where.push(`(
        lower(customer_name) LIKE ?
        OR customer_phone LIKE ?
        OR lower(order_number) LIKE ?
        OR lower(notes) LIKE ?
      )`);
      values.push(`%${q}%`, `%${normalizePhone(q)}%`, `%${q}%`, `%${q}%`);
    }
    if (overdueOnly) {
      where.push(`status IN ('active', 'overdue') AND due_date IS NOT NULL AND due_date < date('now')`);
    }

    const rows = await db.prepare(`
      SELECT *
      FROM receivables
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE status WHEN 'overdue' THEN 0 WHEN 'active' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END,
        COALESCE(due_date, '9999-12-31') ASC,
        created_at_utc DESC
      LIMIT ?
    `).bind(...values, limit).all();

    const summary = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('active', 'overdue') THEN balance_amount ELSE 0 END), 0) AS open_balance,
        COALESCE(SUM(CASE WHEN status = 'overdue' OR (status = 'active' AND due_date < date('now')) THEN balance_amount ELSE 0 END), 0) AS overdue_balance,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN principal_amount ELSE 0 END), 0) AS paid_principal,
        COUNT(*) AS total_count
      FROM receivables
      WHERE tenant_id = ?
    `).bind(tenantId).first();

    return jsonResponse({
      ok: true,
      receivables: (rows.results || []).map(publicReceivable),
      summary: {
        openBalance: Number(summary?.open_balance || 0),
        overdueBalance: Number(summary?.overdue_balance || 0),
        paidPrincipal: Number(summary?.paid_principal || 0),
        totalCount: Number(summary?.total_count || 0),
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar cuentas por cobrar.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, WRITE_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    await ensureOrderReceivableColumns(env);
    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    const body = await readJson(request);
    const actor = actorFromSession(auth.session);

    const saleType = RECEIVABLE_TYPES.includes(body.saleType) ? body.saleType : 'credit';
    const order = await orderDefaults(env, tenantId, body.orderId || body.order_id);
    const customer = await ensureCustomer(env, tenantId, {
      ...body,
      customerName: body.customerName || order?.customer_name,
      customerPhone: body.customerPhone || order?.customer_phone,
    });

    const principalAmount = normalizeAmount(body.principalAmount ?? body.totalAmount ?? order?.total);
    const downPaymentAmount = normalizeAmount(body.downPaymentAmount ?? body.downPayment ?? 0);
    if (!principalAmount) return jsonResponse({ ok: false, error: 'El total de la venta debe ser mayor a cero.' }, 400);
    if (downPaymentAmount > principalAmount) return jsonResponse({ ok: false, error: 'El anticipo no puede ser mayor al total.' }, 400);

    const id = crypto.randomUUID();
    const now = nowIso();
    await db.prepare(`
      INSERT INTO receivables (
        id, tenant_id, order_id, order_number, customer_id, customer_name, customer_phone,
        sale_type, status, principal_amount, down_payment_amount, paid_amount, balance_amount,
        due_date, next_payment_date, reserved_until_date, delivered_at_utc, notes,
        created_by_user_id, created_by_name, created_at_utc, updated_at_utc
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      tenantId,
      order?.id || normalizeText(body.orderId || body.order_id),
      order?.order_number || normalizeText(body.orderNumber || body.order_number),
      customer.id,
      customer.name,
      customer.phone,
      saleType,
      principalAmount,
      downPaymentAmount,
      principalAmount,
      normalizeText(body.dueDate || body.due_date),
      normalizeText(body.nextPaymentDate || body.next_payment_date),
      normalizeText(body.reservedUntilDate || body.reserved_until_date),
      saleType === 'credit' ? now : normalizeText(body.deliveredAtUtc || ''),
      normalizeText(body.notes),
      actor.userId,
      actor.name,
      now,
      now,
    ).run();

    if (downPaymentAmount > 0) {
      await db.prepare(`
        INSERT INTO receivable_payments (
          id, tenant_id, receivable_id, amount, payment_method, branch_id, branch_name,
          paid_at_utc, received_by_user_id, received_by_name, notes, status,
          created_at_utc, updated_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
      `).bind(
        crypto.randomUUID(),
        tenantId,
        id,
        downPaymentAmount,
        normalizeText(body.downPaymentMethod || body.paymentMethod || 'anticipo'),
        normalizeText(body.branchId || body.branch_id),
        normalizeText(body.branchName || body.branch_name),
        now,
        actor.userId,
        actor.name,
        'Anticipo inicial',
        now,
        now,
      ).run();
    }

    const receivable = await recalculateReceivable(env, tenantId, id);

    if (order?.id) {
      try {
        await db.prepare(`
          UPDATE orders
          SET receivable_id = ?, payment_plan_status = ?
          WHERE tenant_id = ? AND id = ?
        `).bind(id, receivable.status, tenantId, order.id).run();
      } catch {
        // orders columns are optional in this standalone proposal.
      }
    }

    return jsonResponse({ ok: true, receivable });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo crear la cuenta por cobrar.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAuth(request, env, WRITE_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    const body = await readJson(request);
    const id = normalizeText(body.id);
    if (!id) return jsonResponse({ ok: false, error: 'Falta id de la cuenta por cobrar.' }, 400);

    const row = await db.prepare(`SELECT * FROM receivables WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Cuenta por cobrar no encontrada.' }, 404);

    const sets = [];
    const values = [];
    for (const [field, column] of [
      ['dueDate', 'due_date'],
      ['nextPaymentDate', 'next_payment_date'],
      ['reservedUntilDate', 'reserved_until_date'],
      ['notes', 'notes'],
    ]) {
      if (body[field] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(normalizeText(body[field]));
      }
    }
    if (body.delivered === true) {
      sets.push('delivered_at_utc = COALESCE(delivered_at_utc, ?)');
      values.push(nowIso());
    }
    if (body.status !== undefined) {
      const status = normalizeText(body.status);
      if (!RECEIVABLE_STATUSES.includes(status)) return jsonResponse({ ok: false, error: 'Estado invalido.' }, 400);
      if (['cancelled', 'written_off'].includes(status) && !ADMIN_ROLES.includes(auth.session?.role)) {
        return jsonResponse({ ok: false, error: 'Solo admin puede cancelar o condonar saldos.' }, 403);
      }
      sets.push('status = ?');
      values.push(status);
    }
    if (!sets.length) return jsonResponse({ ok: false, error: 'No hay cambios que guardar.' }, 400);

    sets.push('updated_at_utc = ?');
    values.push(nowIso(), tenantId, id);
    await db.prepare(`UPDATE receivables SET ${sets.join(', ')} WHERE tenant_id = ? AND id = ?`).bind(...values).run();
    const receivable = await recalculateReceivable(env, tenantId, id);
    return jsonResponse({ ok: true, receivable });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo actualizar la cuenta por cobrar.', detail: error.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ADMIN_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const url = new URL(request.url);
    const id = normalizeText(url.searchParams.get('id'));
    const reason = normalizeText(url.searchParams.get('reason')) || 'Cancelada por admin';
    if (!id) return jsonResponse({ ok: false, error: 'Falta id de la cuenta por cobrar.' }, 400);

    await requireDb(env).prepare(`
      UPDATE receivables
      SET status = 'cancelled',
          cancelled_at_utc = ?,
          cancelled_reason = ?,
          updated_at_utc = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(nowIso(), reason, nowIso(), tenantId, id).run();

    return jsonResponse({ ok: true, cancelled: true, id });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cancelar la cuenta por cobrar.', detail: error.message }, 500);
  }
}
