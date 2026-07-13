import { jsonResponse } from '../_shared/http.js';
import { decryptSecret } from '../_shared/payments.js';
import {
  ensureMetaMessagingTables,
  verifyMetaMessagingWebhookSignature,
  getMetaPageConnectionByPageId,
  resolveInstagramSender,
  claimMetaMessagingWebhookEvent,
  markMetaMessagingWebhookEventProcessed,
  logMetaChannelMessage,
} from '../_shared/metaMessaging.js';
import { handleIncomingEvent } from '../_shared/metaMessagingBot.js';

// -----------------------------------------------------------------------
// Verificación del webhook (una sola vez por producto -- Messenger e
// Instagram se configuran cada uno en su propia sección de Webhooks en el
// dashboard de Meta, pero ambos pueden apuntar a esta misma URL). Reusa el
// mismo META_WEBHOOK_VERIFY_TOKEN que ya cargaste para WhatsApp.
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
// Mensajes entrantes de Messenger (object: "page") e Instagram
// (object: "instagram") -- ambos comparten el mismo shape de
// entry[].messaging[]. El tenant se identifica por entry[].id: page_id
// para Messenger, instagram_business_account_id o ig_user_id (standalone)
// para Instagram.
// -----------------------------------------------------------------------
export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();

  if (!(await verifyMetaMessagingWebhookSignature(request, env, rawBody))) {
    return jsonResponse({ ok: false, error: 'Firma inválida.' }, 401);
  }

  let payload = {};
  try { payload = JSON.parse(rawBody); } catch { payload = {}; }

  await ensureMetaMessagingTables(env);

  try {
    for (const entry of payload.entry || []) {
      const channel = payload.object === 'instagram' ? 'instagram' : 'messenger';

      let sender;
      if (channel === 'messenger') {
        const connection = await getMetaPageConnectionByPageId(env, entry.id);
        if (!connection) continue; // página no reconocida (o tenant desconectado)
        sender = { tenantId: connection.tenant_id, endpointId: connection.page_id, accessTokenEncrypted: connection.page_access_token_encrypted };
      } else {
        sender = await resolveInstagramSender(env, entry.id);
        if (!sender) continue; // cuenta de Instagram no reconocida
      }

      for (const event of entry.messaging || []) {
        // Los mensajes traen mid único; los postbacks no, así que para
        // esos se arma una clave con sender+timestamp (igual de estable
        // para deduplicar reenvíos del mismo evento).
        const providerEventId = event.message?.mid
          ? `${channel}:msg:${event.message.mid}`
          : `${channel}:postback:${event.sender?.id}:${event.timestamp}`;
        const alreadyClaimed = await claimMetaMessagingWebhookEvent(env, providerEventId, { tenantId: sender.tenantId, channel, eventType: event.message ? 'message' : 'postback' });
        if (alreadyClaimed) continue;

        try {
          const accessToken = await decryptSecret(sender.accessTokenEncrypted, env);
          const from = event.sender?.id;
          await logMetaChannelMessage(env, {
            tenantId: sender.tenantId,
            channel,
            customerId: from,
            direction: 'inbound',
            messageType: event.message ? 'message' : 'postback',
            providerMessageId: event.message?.mid || null,
            content: event,
          });
          await handleIncomingEvent(env, { channel, endpointId: sender.endpointId, accessToken, tenantId: sender.tenantId, from, event });
          await markMetaMessagingWebhookEventProcessed(env, providerEventId, { status: 'processed' });
        } catch (error) {
          await markMetaMessagingWebhookEventProcessed(env, providerEventId, { status: 'error', errorMessage: error.message });
        }
      }
    }
  } catch (error) {
    // No devolvemos 500 a propósito -- un error puntual no debe hacer que
    // Meta reintente TODO el batch indefinidamente (mismo criterio que
    // webhooks/whatsapp.js).
    return jsonResponse({ ok: true, note: 'processed_with_errors', detail: error.message });
  }

  return jsonResponse({ ok: true });
}
