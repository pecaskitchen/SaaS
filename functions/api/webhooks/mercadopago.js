import { jsonResponse, requireDb } from '../_shared/http.js';
import { claimWebhookEvent, markWebhookEventProcessed, getValidAccessToken } from '../_shared/payments.js';

// -----------------------------------------------------------------------
// Cómo identificamos el tenant (importante, léelo antes de tocar esto)
// -----------------------------------------------------------------------
// El payload/query que manda Mercado Pago (data.id, type, etc.) NO dice a
// que tenant pertenece el pago sin antes consultarlo con ALGÚN access
// token — y como cada tenant tiene su propio token OAuth, no hay uno solo
// "correcto" a priori (problema del huevo y la gallina).
//
// Lo resolvemos nosotros mismos: al crear la preferencia en
// checkout/create.js le agregamos nuestro propio "order_id" como query
// param al notification_url:
//   `${APP_URL}/api/webhooks/mercadopago?order_id=${order.id}`
// Mercado Pago llama a esa URL agregando sus propios params (data.id,
// type, ...) sin tocar los que ya tenía. Como orders.id es autoincremental
// y único en TODA la base compartida (una sola tabla `orders` para todos
// los tenants), leer `orders.tenant_id` a partir de nuestro propio
// order_id es 100% confiable y no depende de nada que mande Mercado Pago.
//
// Con eso: (1) resolvemos tenant_id, (2) sacamos el access_token de ESE
// tenant, (3) consultamos el pago con ese token, (4) confirmamos que
// external_reference coincide con el order_id que nosotros pusimos.
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

async function verifyMercadoPagoSignature(request, env, dataId) {
  const signatureHeader = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1 || !dataId) return false;
  if (!env.MP_WEBHOOK_SECRET) return false; // sin secreto configurado, no se puede validar: rechazar
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, manifest);
  return timingSafeEqual(expected, v1);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  // Body puede venir vacío en algunas notificaciones legacy (topic en
  // query, no en body) — lo leemos con tolerancia.
  const rawBody = await request.text();
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }

  const orderId = url.searchParams.get('order_id');
  const dataId = url.searchParams.get('data.id') || body?.data?.id || '';
  const eventType = url.searchParams.get('type') || body.type || body.action || '';

  // Siempre 200 salvo error de firma/formato — Mercado Pago reintenta
  // agresivamente ante cualquier respuesta que no sea 2xx, y no queremos
  // reintentos infinitos por pedidos que ya no existen o eventos que no
  // nos interesan.
  try {
    if (!(await verifyMercadoPagoSignature(request, env, dataId))) {
      return jsonResponse({ ok: false, error: 'Firma invalida.' }, 401);
    }

    if (eventType !== 'payment') {
      return jsonResponse({ ok: true, skipped: true });
    }

    if (!orderId || !dataId) {
      return jsonResponse({ ok: true, skipped: true, reason: 'missing_order_id_or_data_id' });
    }

    const providerEventId = `payment:${dataId}`;
    const alreadyClaimed = await claimWebhookEvent(env, {
      provider: 'mercado_pago',
      providerEventId,
      tenantId: null,
      eventType,
      resourceId: dataId,
    });
    if (alreadyClaimed) return jsonResponse({ ok: true, deduped: true });

    const db = requireDb(env);
    const order = await db.prepare(`SELECT id, tenant_id, total, payment_status FROM orders WHERE id = ?`).bind(orderId).first();
    if (!order) {
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago', { status: 'skipped', errorMessage: 'order_not_found' });
      return jsonResponse({ ok: true, skipped: true });
    }

    if (order.payment_status === 'paid') {
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago', { status: 'skipped', errorMessage: 'already_paid' });
      return jsonResponse({ ok: true, deduped: true });
    }

    const accessToken = await getValidAccessToken(env, order.tenant_id, 'mercado_pago');

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payment = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok || !payment.id) {
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago', { status: 'error', errorMessage: 'payment_fetch_failed' });
      return jsonResponse({ ok: false, error: 'No se pudo consultar el pago.' }, 502);
    }

    // Verificaciones antes de confiar en el pago (ver auditoria — nunca
    // confiar en el webhook a ciegas, siempre reconsultar y comparar).
    const externalReferenceMatches = String(payment.external_reference || '') === String(order.id);
    const amountMatches = Math.round(Number(payment.transaction_amount || 0)) === Math.round(Number(order.total || 0));
    const currencyOk = String(payment.currency_id || '').toUpperCase() === 'MXN';

    if (!externalReferenceMatches) {
      await markWebhookEventProcessed(env, providerEventId, 'mercado_pago', { status: 'error', errorMessage: 'external_reference_mismatch' });
      return jsonResponse({ ok: false, error: 'external_reference no coincide.' }, 409);
    }

    if (payment.status === 'approved' && amountMatches && currencyOk) {
      await db.prepare(`
        UPDATE orders
        SET payment_status = 'paid',
            payment_method = 'mercado_pago',
            provider_payment_id = ?,
            provider_merchant_order_id = ?,
            paid_at = CURRENT_TIMESTAMP,
            updated_at_utc = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND payment_status != 'paid'
      `).bind(String(payment.id), String(payment.order?.id || ''), order.id, order.tenant_id).run();
    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      await db.prepare(`
        UPDATE orders SET payment_status = ?, updated_at_utc = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND payment_status != 'paid'
      `).bind(payment.status === 'rejected' ? 'rejected' : 'cancelled', order.id, order.tenant_id).run();
    }
    // pending/in_process: no se toca el pedido, se espera la siguiente notificación.

    await markWebhookEventProcessed(env, providerEventId, 'mercado_pago', { status: 'processed' });
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'Error procesando el webhook.', detail: error.message }, 500);
  }
}
