import { nowIso, requireDb } from './http.js';
import { ensurePlatformTables } from './platform.js';

// -----------------------------------------------------------------------
// Cobro recurrente de la MENSUALIDAD del negocio a Omdexa
// -----------------------------------------------------------------------
// Esto cobra al DUENO del negocio (tenant) su suscripcion a la plataforma,
// usando la cuenta de Mercado Pago de OMDEXA (token de plataforma). Es
// distinto por completo del cobro a los clientes finales del storefront,
// que usa la cuenta OAuth de cada negocio (ver _shared/payments.js).
//
// Modelo de Mercado Pago: "preapproval" (suscripcion sin plan). Creamos un
// preapproval con external_reference = tenant_id; MP devuelve un init_point
// (checkout_url) que el dueno abre para autorizar su tarjeta. A partir de
// ahi MP cobra cada mes solo y nos avisa por webhook.
// -----------------------------------------------------------------------

const MP_API = 'https://api.mercadopago.com';

// Token de la cuenta de Mercado Pago de OMDEXA (no la de los negocios).
// Se configura como secreto de Cloudflare:
//   wrangler secret put PLATFORM_MP_ACCESS_TOKEN
export function platformMpToken(env) {
  const token = String(env.PLATFORM_MP_ACCESS_TOKEN || '').trim();
  if (!token) {
    throw Object.assign(
      new Error('Falta configurar PLATFORM_MP_ACCESS_TOKEN (token de la cuenta de Mercado Pago de Omdexa).'),
      { code: 'NO_PLATFORM_MP_TOKEN', status: 409 },
    );
  }
  return token;
}

export function platformBaseUrl(env) {
  return String(env.PLATFORM_URL || env.APP_URL || 'https://omdexa.com').replace(/\/+$/, '');
}

// -----------------------------------------------------------------------
// Esquema: columnas que ligan la suscripcion con su preapproval de MP.
// Auto-reparable (mismo patron del resto del backend): cada ALTER falla
// silenciosamente si la columna ya existe.
// -----------------------------------------------------------------------

let billingColumnsEnsured = false;
export async function ensureBillingColumns(env) {
  if (billingColumnsEnsured) return;
  await ensurePlatformTables(env);
  const db = requireDb(env);
  const columns = [
    "provider TEXT NOT NULL DEFAULT 'manual'",
    'mp_preapproval_id TEXT',
    'mp_payer_email TEXT',
    'checkout_url TEXT',
    'provider_status TEXT',
    'provider_synced_at TEXT',
  ];
  for (const column of columns) {
    try { await db.prepare(`ALTER TABLE saas_subscriptions ADD COLUMN ${column}`).run(); } catch { /* ya existe */ }
  }
  billingColumnsEnsured = true;
}

// -----------------------------------------------------------------------
// Acceso a la suscripcion del tenant
// -----------------------------------------------------------------------

export async function getSubscription(env, tenantId) {
  await ensureBillingColumns(env);
  return requireDb(env)
    .prepare(`SELECT * FROM saas_subscriptions WHERE tenant_id = ? ORDER BY created_at_utc DESC LIMIT 1`)
    .bind(tenantId)
    .first();
}

export function sanitizeSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    plan: row.plan,
    status: row.status,
    provider: row.provider || 'manual',
    providerStatus: row.provider_status || '',
    monthlyPriceCents: Number(row.monthly_price_cents || 0),
    currency: row.currency || 'MXN',
    payerEmail: row.mp_payer_email || '',
    checkoutUrl: row.checkout_url || '',
    hasPreapproval: Boolean(row.mp_preapproval_id),
    trialEndsAt: row.trial_ends_at || '',
    lastPaymentAt: row.last_payment_at || '',
    nextPaymentDueAt: row.next_payment_due_at || '',
    currentPeriodEndsAt: row.current_period_ends_at || '',
    providerSyncedAt: row.provider_synced_at || '',
  };
}

// -----------------------------------------------------------------------
// Llamadas a la API de Mercado Pago (cuenta de plataforma)
// -----------------------------------------------------------------------

async function mpFetch(env, path, { method = 'GET', body = null } = {}) {
  const response = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${platformMpToken(env)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(data.message || `Mercado Pago respondio ${response.status}.`),
      { code: 'MP_ERROR', status: 502, mpStatus: response.status, mpBody: data },
    );
  }
  return data;
}

// Crea (o reemplaza) el preapproval de un tenant y guarda el link de
// autorizacion. amountCents / payerEmail son obligatorios para MP.
export async function createPreapproval(env, { tenantId, reason, payerEmail, amountCents, currency = 'MXN' }) {
  await ensureBillingColumns(env);
  const amount = Math.round(Number(amountCents || 0));
  if (!amount || amount <= 0) throw Object.assign(new Error('El precio mensual debe ser mayor a 0.'), { status: 400 });
  if (!payerEmail) throw Object.assign(new Error('Se necesita el email del dueno para el cobro.'), { status: 400 });

  const backUrl = `${platformBaseUrl(env)}/plataforma?cobro=ok`;
  const preapproval = await mpFetch(env, '/preapproval', {
    method: 'POST',
    body: {
      reason: reason || `Suscripcion Omdexa`,
      external_reference: String(tenantId),
      payer_email: payerEmail,
      back_url: backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount / 100,
        currency_id: currency,
      },
    },
  });

  const db = requireDb(env);
  await db.prepare(`
    UPDATE saas_subscriptions
    SET provider = 'mercado_pago',
        mp_preapproval_id = ?,
        mp_payer_email = ?,
        checkout_url = ?,
        provider_status = ?,
        provider_synced_at = ?,
        updated_at_utc = ?
    WHERE tenant_id = ?
  `).bind(
    String(preapproval.id || ''),
    payerEmail,
    String(preapproval.init_point || preapproval.sandbox_init_point || ''),
    String(preapproval.status || 'pending'),
    nowIso(),
    nowIso(),
    tenantId,
  ).run();

  return {
    preapprovalId: preapproval.id,
    checkoutUrl: preapproval.init_point || preapproval.sandbox_init_point || '',
    status: preapproval.status || 'pending',
  };
}

export async function fetchPreapproval(env, preapprovalId) {
  return mpFetch(env, `/preapproval/${encodeURIComponent(preapprovalId)}`);
}

export async function fetchAuthorizedPayment(env, authorizedPaymentId) {
  return mpFetch(env, `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
}

// Cambia el estado del preapproval en MP (pausar / reactivar / cancelar).
export async function updatePreapprovalStatus(env, preapprovalId, status) {
  return mpFetch(env, `/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    body: { status },
  });
}

// -----------------------------------------------------------------------
// Mapeo de estado MP -> estado del negocio (saas_tenants.status)
// -----------------------------------------------------------------------
// El gating de servicio ya vive en _shared/tenant.js:
//   - 'trial' / 'active' / 'past_due' => el storefront se sirve
//   - 'paused' / 'cancelled'          => storefront bloqueado
// Por eso aqui somos conservadores: un fallo de cobro pasa a 'past_due'
// (sigue funcionando, con margen para reintentar), y solo una cancelacion
// explicita o el corte definitivo pasa a 'paused'.

async function setTenantStatus(env, tenantId, status) {
  const db = requireDb(env);
  await db.prepare(`UPDATE saas_tenants SET status = ?, updated_at_utc = ? WHERE id = ?`)
    .bind(status, nowIso(), tenantId).run();
}

async function setSubscriptionFields(env, tenantId, fields) {
  const db = requireDb(env);
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setSql = keys.map((k) => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE saas_subscriptions SET ${setSql}, updated_at_utc = ? WHERE tenant_id = ?`)
    .bind(...keys.map((k) => fields[k]), nowIso(), tenantId).run();
}

function addOneMonthIso(fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

// Aplica el estado de un preapproval al negocio. `preapproval` es el objeto
// crudo de MP (GET /preapproval/{id}).
export async function applyPreapprovalStatus(env, tenantId, preapproval) {
  await ensureBillingColumns(env);
  const mpStatus = String(preapproval.status || '').toLowerCase();
  await setSubscriptionFields(env, tenantId, {
    provider_status: mpStatus,
    provider_synced_at: nowIso(),
  });

  if (mpStatus === 'authorized') {
    // Tarjeta autorizada: el negocio queda al corriente.
    await setSubscriptionFields(env, tenantId, { status: 'active' });
    await setTenantStatus(env, tenantId, 'active');
  } else if (mpStatus === 'paused') {
    // Suscripcion pausada en MP: margen de gracia, sigue sirviendo.
    await setSubscriptionFields(env, tenantId, { status: 'past_due' });
    await setTenantStatus(env, tenantId, 'past_due');
  } else if (mpStatus === 'cancelled') {
    // Cancelacion explicita: se corta el servicio.
    await setSubscriptionFields(env, tenantId, { status: 'cancelled' });
    await setTenantStatus(env, tenantId, 'paused');
  }
  // 'pending': aun no autoriza la tarjeta; no tocamos el estado del negocio.
  return mpStatus;
}

// Aplica un cobro mensual (authorized_payment) al negocio.
export async function applyAuthorizedPayment(env, tenantId, payment) {
  await ensureBillingColumns(env);
  const status = String(payment.status || '').toLowerCase();
  if (status === 'processed' || status === 'approved') {
    const now = nowIso();
    await setSubscriptionFields(env, tenantId, {
      status: 'active',
      last_payment_at: now,
      current_period_ends_at: addOneMonthIso(now),
      next_payment_due_at: addOneMonthIso(now),
      provider_status: 'authorized',
      provider_synced_at: now,
    });
    await setTenantStatus(env, tenantId, 'active');
  } else if (status === 'rejected' || status === 'cancelled') {
    // Cobro rechazado: pasa a pago pendiente (sigue sirviendo con margen).
    await setSubscriptionFields(env, tenantId, { status: 'past_due', provider_synced_at: nowIso() });
    await setTenantStatus(env, tenantId, 'past_due');
  }
  return status;
}
