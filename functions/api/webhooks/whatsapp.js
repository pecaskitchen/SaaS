import { jsonResponse } from '../_shared/http.js';
import {
  ensureWhatsappTables,
  verifyMetaWebhookSignature,
  getWhatsappConnectionByWabaId,
  getValidWhatsappToken,
  claimWhatsappWebhookEvent,
  markWhatsappWebhookEventProcessed,
  logWhatsappMessage,
  markMessageRead,
} from '../_shared/whatsapp.js';
import { handleIncomingMessage } from '../_shared/whatsappBot.js';

// -----------------------------------------------------------------------
// Verificación del webhook (una sola vez, cuando lo configuras en el
// dashboard de Meta — no es por tenant, es a nivel de tu app entera).
// -----------------------------------------------------------------------
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && env.META_WEBHOOK_VERIFY_TOKEN && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// -----------------------------------------------------------------------
// Mensajes y actualizaciones de estado entrantes — todos los tenants
// comparten este endpoint; el tenant se identifica por entry[].id (WABA ID),
// que Meta siempre incluye, sin necesitar ningún truco de query params
// (a diferencia del webhook de Mercado Pago).
// -----------------------------------------------------------------------
export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();

  if (!(await verifyMetaWebhookSignature(request, env, rawBody))) {
    return jsonResponse({ ok: false, error: 'Firma inválida.' }, 401);
  }

  let payload = {};
  try { payload = JSON.parse(rawBody); } catch { payload = {}; }

  await ensureWhatsappTables(env);

  // Meta reintenta si no respondes 200 rápido — procesamos best-effort y
  // respondemos 200 salvo error de firma, para no generar reintentos
  // infinitos por un evento que no nos interesa.
  try {
    for (const entry of payload.entry || []) {
      const wabaId = entry.id;
      const connection = await getWhatsappConnectionByWabaId(env, wabaId);
      if (!connection) continue; // WABA no reconocido (o tenant desconectado) — se ignora

      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Mensajes entrantes
        for (const message of value.messages || []) {
          const providerEventId = `msg:${message.id}`;
          const alreadyClaimed = await claimWhatsappWebhookEvent(env, providerEventId, { tenantId: connection.tenant_id, eventType: 'message' });
          if (alreadyClaimed) continue;

          try {
            const accessToken = await getValidWhatsappToken(env, connection.tenant_id);
            await logWhatsappMessage(env, {
              tenantId: connection.tenant_id,
              customerPhone: message.from,
              direction: 'inbound',
              messageType: message.type,
              waMessageId: message.id,
              content: message,
            });
            await markMessageRead(env, { phoneNumberId: connection.phone_number_id, accessToken, waMessageId: message.id });
            await handleIncomingMessage(env, { connection, accessToken, from: message.from, message });
            await markWhatsappWebhookEventProcessed(env, providerEventId, { status: 'processed' });
          } catch (error) {
            await markWhatsappWebhookEventProcessed(env, providerEventId, { status: 'error', errorMessage: error.message });
          }
        }

        // Actualizaciones de estado de mensajes salientes (enviado,
        // entregado, leído, fallido) — se registran para auditoría; no
        // hay lógica de negocio enganchada a esto todavía.
        for (const status of value.statuses || []) {
          const providerEventId = `status:${status.id}:${status.status}`;
          const alreadyClaimed = await claimWhatsappWebhookEvent(env, providerEventId, { tenantId: connection.tenant_id, eventType: 'status' });
          if (alreadyClaimed) continue;
          await logWhatsappMessage(env, {
            tenantId: connection.tenant_id,
            customerPhone: status.recipient_id,
            direction: 'outbound',
            messageType: `status:${status.status}`,
            waMessageId: status.id,
            content: status,
          });
          await markWhatsappWebhookEventProcessed(env, providerEventId, { status: 'processed' });
        }
      }
    }
  } catch (error) {
    // No devolvemos 500 aquí a propósito: un solo entry con error no debe
    // hacer que Meta reintente TODO el batch indefinidamente. El error
    // puntual ya quedó registrado por evento arriba.
    return jsonResponse({ ok: true, note: 'processed_with_errors', detail: error.message });
  }

  return jsonResponse({ ok: true });
}
