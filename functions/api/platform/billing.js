import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { writeAudit } from '../_shared/audit.js';
import {
  ensureBillingColumns,
  getSubscription,
  sanitizeSubscription,
  createPreapproval,
  fetchPreapproval,
  applyPreapprovalStatus,
  updatePreapprovalStatus,
} from '../_shared/tenantBilling.js';

// -----------------------------------------------------------------------
// Cobro recurrente de la mensualidad del negocio (solo admin de Omdexa)
// -----------------------------------------------------------------------
// GET   ?tenant_id=...            -> estado actual de la suscripcion
// POST  { tenantId, payerEmail }  -> genera link de cobro (preapproval MP)
// PATCH { tenantId, action }      -> pausar / reactivar / cancelar / sync
// -----------------------------------------------------------------------

async function readTenant(db, tenantId) {
  return db.prepare(`SELECT * FROM saas_tenants WHERE id = ? OR slug = ? LIMIT 1`).bind(tenantId, tenantId).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensureBillingColumns(env);

    const tenantId = String(new URL(request.url).searchParams.get('tenant_id') || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenant_id.' }, 400);

    const db = requireDb(env);
    const tenant = await readTenant(db, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Negocio no encontrado.' }, 404);

    const subscription = await getSubscription(env, tenant.id);
    return jsonResponse({
      ok: true,
      tenantStatus: tenant.status,
      hasPlatformToken: Boolean(String(env.PLATFORM_MP_ACCESS_TOKEN || '').trim()),
      subscription: sanitizeSubscription(subscription),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar el cobro.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensureBillingColumns(env);

    const body = await readJson(request);
    const tenantId = String(body.tenantId || body.id || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    const tenant = await readTenant(db, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Negocio no encontrado.' }, 404);

    const subscription = await getSubscription(env, tenant.id);
    if (!subscription) return jsonResponse({ ok: false, error: 'El negocio no tiene suscripcion registrada.' }, 409);

    const payerEmail = String(body.payerEmail || subscription.mp_payer_email || tenant.contact_email || '').trim();
    if (!payerEmail) return jsonResponse({ ok: false, error: 'Falta el email del dueno para el cobro.' }, 400);

    // El monto sale del precio mensual de la suscripcion, salvo que se
    // mande uno explicito (en centavos) desde la plataforma.
    const amountCents = Math.round(Number(body.amountCents ?? subscription.monthly_price_cents ?? 0));
    if (!amountCents || amountCents <= 0) {
      return jsonResponse({ ok: false, error: 'Define primero el precio mensual del negocio.' }, 400);
    }

    const result = await createPreapproval(env, {
      tenantId: tenant.id,
      reason: `Suscripcion Omdexa - ${tenant.name}`,
      payerEmail,
      amountCents,
      currency: subscription.currency || 'MXN',
    });

    await writeAudit(env, {
      tenantId: tenant.id,
      actorRole: 'platform_admin',
      action: 'tenant.billing.checkout_created',
      entityType: 'subscription',
      entityId: subscription.id,
      metadata: { preapprovalId: result.preapprovalId, amountCents, payerEmail },
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ ok: false, error: error.message || 'No se pudo generar el cobro.', detail: error.mpBody || null }, status);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensureBillingColumns(env);

    const body = await readJson(request);
    const tenantId = String(body.tenantId || body.id || '').trim();
    const action = String(body.action || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    const tenant = await readTenant(db, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Negocio no encontrado.' }, 404);

    const subscription = await getSubscription(env, tenant.id);
    const preapprovalId = subscription?.mp_preapproval_id;
    if (!preapprovalId) return jsonResponse({ ok: false, error: 'Este negocio no tiene una suscripcion de Mercado Pago activa.' }, 409);

    // 'sync' re-consulta el estado real en MP y lo aplica (util para
    // reconciliar sin esperar al webhook).
    if (action === 'sync') {
      const preapproval = await fetchPreapproval(env, preapprovalId);
      const mpStatus = await applyPreapprovalStatus(env, tenant.id, preapproval);
      return jsonResponse({ ok: true, action, providerStatus: mpStatus });
    }

    const statusByAction = { pause: 'paused', reactivate: 'authorized', cancel: 'cancelled' };
    const mpTarget = statusByAction[action];
    if (!mpTarget) return jsonResponse({ ok: false, error: 'Accion no valida.' }, 400);

    const updated = await updatePreapprovalStatus(env, preapprovalId, mpTarget);
    const mpStatus = await applyPreapprovalStatus(env, tenant.id, updated);

    await writeAudit(env, {
      tenantId: tenant.id,
      actorRole: 'platform_admin',
      action: `tenant.billing.${action}`,
      entityType: 'subscription',
      entityId: subscription.id,
      metadata: { preapprovalId, providerStatus: mpStatus },
    });

    return jsonResponse({ ok: true, action, providerStatus: mpStatus });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ ok: false, error: error.message || 'No se pudo actualizar el cobro.', detail: error.mpBody || null }, status);
  }
}
