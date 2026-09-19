import { jsonResponse } from '../_shared/http.js';
import { claimWebhookEvent, markWebhookEventProcessed } from '../_shared/payments.js';
import {
  fetchPreapproval,
  fetchAuthorizedPayment,
  applyPreapprovalStatus,
  applyAuthorizedPayment,
} from '../_shared/tenantBilling.js';

// -----------------------------------------------------------------------
// Webhook de la SUSCRIPCION del negocio (cobro de la mensualidad a Omdexa)
// -----------------------------------------------------------------------
// Distinto del webhook de pagos del storefront (webhooks/mercadopago.js):
// este escucha la cuenta de Mercado Pago de PLATAFORMA y procesa dos tipos
// de evento de suscripcion:
//   - subscription_preapproval        -> autorizacion / pausa / cancelacion
//   - subscription_authorized_payment -> cada cobro mensual
//
// El tenant se identifica solo: al crear el preapproval pusimos
// external_reference = tenant_id, asi que lo leemos del propio objeto de MP
// (no confiamos en nada mas del payload).
//
// Configuracion en el panel de Mercado Pago (cuenta de Omdexa):
//   URL: https://omdexa.com/api/webhooks/mp-billing
//   Eventos: Suscripciones (preapproval) y Pagos de suscripcion.
//   Secreto: PLATFORM_MP_WEBHOOK_SECRET (o cae a MP_WEBHOOK_SECRET).
// -----------------------------------------------------------------------

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseSignatureHeader(value) {
  const parts = {};
  for (const chunk of String(value || '').split(',')) {
    const idx = chunk.indexOf('=');
    if (idx === -1) continue;
    parts[chunk.slice(0, idx).trim()] = chunk.slice(idx + 1).trim();
  }
  return parts;
}

function billingWebhookSecret(env) {
  return env.PLATFORM_MP_WEBHOOK_SECRET || env.MP_WEBHOOK_SECRET || '';
}

async function verifySignature(request, env, dataId) {
  const secret = billingWebhookSecret(env);
  if (!secret) return false; // sin secreto no se puede validar: rechazar
  const { ts, v1 } = parseSignatureHeader(request.headers.get('x-signature') || '');
  const requestId = request.headers.get('x-request-id') || '';
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  return timingSafeEqual(expected, v1);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const rawBody = await request.text();
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }

  const dataId = url.searchParams.get('data.id') || body?.data?.id || '';
  const eventType = url.searchParams.get('type') || body.type || body.action || '';

  try {
    if (!(await verifySignature(request, env, dataId))) {
      return jsonResponse({ ok: false, error: 'Firma invalida.' }, 401);
    }

    // Solo procesamos eventos de suscripcion; el resto se ignora con 200
    // para que Mercado Pago no reintente en bucle.
    const isPreapproval = eventType.includes('subscription_preapproval') || eventType === 'preapproval';
    const isAuthorizedPayment = eventType.includes('subscription_authorized_payment') || eventType === 'authorized_payment';
    if (!isPreapproval && !isAuthorizedPayment) {
      return jsonResponse({ ok: true, skipped: true, reason: 'event_ignored' });
    }
    if (!dataId) {
      return jsonResponse({ ok: true, skipped: true, reason: 'missing_data_id' });
    }

    const providerEventId = `${isPreapproval ? 'preapproval' : 'authpay'}:${dataId}`;
    const alreadyClaimed = await claimWebhookEvent(env, {
      provider: 'mercado_pago_billing',
      providerEventId,
      tenantId: null,
      eventType,
      resourceId: dataId,
    });
    if (alreadyClaimed) return jsonResponse({ ok: true, deduped: true });

    if (isPreapproval) {
      const preapproval = await fetchPreapproval(env, dataId);
      const tenantId = String(preapproval.external_reference || '').trim();
      if (!tenantId) {
        await markWebhookEventProcessed(env, providerEventId, 'mercado_pago_billing', { status: 'skipped', errorMessage: 'no_external_reference' });
        return jsonResponse({ ok: true, skipped: true });
      }
      const mpStatus = await applyPreapprovalStatus(env, tenantId, preapproval);
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago_billing', { status: 'processed' });
      return jsonResponse({ ok: true, tenantId, providerStatus: mpStatus });
    }

    // subscription_authorized_payment: cada cobro mensual. Trae el
    // preapproval_id; de ahi sacamos el tenant.
    const payment = await fetchAuthorizedPayment(env, dataId);
    const preapprovalId = payment.preapproval_id || payment.preapproval?.id || '';
    let tenantId = '';
    if (preapprovalId) {
      const preapproval = await fetchPreapproval(env, preapprovalId).catch(() => null);
      tenantId = String(preapproval?.external_reference || '').trim();
    }
    if (!tenantId) {
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago_billing', { status: 'skipped', errorMessage: 'tenant_not_resolved' });
      return jsonResponse({ ok: true, skipped: true });
    }
    const status = await applyAuthorizedPayment(env, tenantId, payment);
    await markWebhookEventProcessed(env, providerEventId, 'mercado_pago_billing', { status: 'processed' });
    return jsonResponse({ ok: true, tenantId, paymentStatus: status });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'Error procesando el webhook de cobro.', detail: error.message }, 500);
  }
}
