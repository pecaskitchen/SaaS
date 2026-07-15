import { requireAuth } from './_shared/auth.js';
import { jsonResponse, nowIso, readJson, requireDb } from './_shared/http.js';
import { resolveTenantId } from './_shared/tenant.js';
import {
  actorFromSession,
  ensureReceivablesSchema,
  loadReceivablePayments,
  normalizeAmount,
  normalizeText,
  recalculateReceivable,
} from './_shared/receivables.js';

const WRITE_ROLES = ['admin', 'manager', 'orders', 'cashier', 'platform_admin'];
const ADMIN_ROLES = ['admin', 'manager', 'platform_admin'];

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, WRITE_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    const body = await readJson(request);
    const receivableId = normalizeText(body.receivableId || body.receivable_id);
    const amount = normalizeAmount(body.amount);
    const paymentMethod = normalizeText(body.paymentMethod || body.payment_method);
    if (!receivableId) return jsonResponse({ ok: false, error: 'Falta cuenta por cobrar.' }, 400);
    if (!amount) return jsonResponse({ ok: false, error: 'El abono debe ser mayor a cero.' }, 400);
    if (!paymentMethod) return jsonResponse({ ok: false, error: 'Selecciona forma de pago.' }, 400);

    const receivable = await db.prepare(`SELECT * FROM receivables WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, receivableId).first();
    if (!receivable) return jsonResponse({ ok: false, error: 'Cuenta por cobrar no encontrada.' }, 404);
    if (['cancelled', 'written_off'].includes(receivable.status)) {
      return jsonResponse({ ok: false, error: 'No puedes abonar a una cuenta cancelada o condonada.' }, 409);
    }
    const balance = normalizeAmount(receivable.balance_amount);
    if (amount > balance && !body.allowOverpayment) {
      return jsonResponse({ ok: false, error: `El abono excede el saldo pendiente de $${balance}.` }, 400);
    }

    const actor = actorFromSession(auth.session);
    const now = nowIso();
    const paymentId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO receivable_payments (
        id, tenant_id, receivable_id, amount, payment_method, branch_id, branch_name,
        paid_at_utc, received_by_user_id, received_by_name, notes, status,
        created_at_utc, updated_at_utc
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
    `).bind(
      paymentId,
      tenantId,
      receivableId,
      amount,
      paymentMethod,
      normalizeText(body.branchId || body.branch_id),
      normalizeText(body.branchName || body.branch_name),
      normalizeText(body.paidAtUtc || body.paid_at_utc) || now,
      actor.userId,
      actor.name,
      normalizeText(body.notes),
      now,
      now,
    ).run();

    const updated = await recalculateReceivable(env, tenantId, receivableId);
    const payments = await loadReceivablePayments(env, tenantId, receivableId);
    return jsonResponse({ ok: true, receivable: updated, paymentId, payments });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo registrar el abono.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ADMIN_ROLES);
    if (!auth.ok) return auth.response;
    await ensureReceivablesSchema(env);
    const tenantId = await resolveTenantId(request, env);
    const db = requireDb(env);
    const body = await readJson(request);
    const id = normalizeText(body.id);
    const reason = normalizeText(body.reason) || 'Anulado por admin';
    if (!id) return jsonResponse({ ok: false, error: 'Falta id del abono.' }, 400);

    const payment = await db.prepare(`SELECT * FROM receivable_payments WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, id).first();
    if (!payment) return jsonResponse({ ok: false, error: 'Abono no encontrado.' }, 404);
    if (payment.status === 'void') return jsonResponse({ ok: false, error: 'Este abono ya fue anulado.' }, 409);

    const actor = actorFromSession(auth.session);
    await db.prepare(`
      UPDATE receivable_payments
      SET status = 'void',
          voided_at_utc = ?,
          voided_by_user_id = ?,
          voided_by_name = ?,
          void_reason = ?,
          updated_at_utc = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(nowIso(), actor.userId, actor.name, reason, nowIso(), tenantId, id).run();

    const updated = await recalculateReceivable(env, tenantId, payment.receivable_id);
    const payments = await loadReceivablePayments(env, tenantId, payment.receivable_id);
    return jsonResponse({ ok: true, receivable: updated, payments });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo anular el abono.', detail: error.message }, 500);
  }
}
