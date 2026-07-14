import { requireDb } from './http.js';
import { encryptSecret, decryptSecret } from './payments.js';
import { graphVersion, graphUrl, verifyMetaWebhookSignature } from './metaGraphApi.js';

export { verifyMetaWebhookSignature };

// -----------------------------------------------------------------------
// Esquema (auto-reparable, mismo patrón que el resto del backend)
// -----------------------------------------------------------------------
export async function ensureWhatsappTables(env) {
  const db = requireDb(env);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_whatsapp_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      waba_id TEXT,
      phone_number_id TEXT,
      display_phone_number TEXT,
      business_name TEXT,
      access_token_encrypted TEXT,
      token_expires_at TEXT,
      connection_status TEXT NOT NULL DEFAULT 'disconnected',
      connected_at TEXT,
      disconnected_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'idle',
      cart_json TEXT NOT NULL DEFAULT '{}',
      order_id INTEGER,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, customer_phone)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_type TEXT,
      wa_message_id TEXT,
      content_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
      id TEXT PRIMARY KEY,
      provider_event_id TEXT NOT NULL UNIQUE,
      tenant_id TEXT,
      event_type TEXT,
      processing_status TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      error_message TEXT
    )`),
  ]);
}

// -----------------------------------------------------------------------
// Conexión por tenant
// -----------------------------------------------------------------------
export async function getWhatsappConnection(env, tenantId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_whatsapp_connections WHERE tenant_id = ? LIMIT 1`).bind(tenantId).first();
}

export async function getWhatsappConnectionByWabaId(env, wabaId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_whatsapp_connections WHERE waba_id = ? AND connection_status = 'connected' LIMIT 1`).bind(wabaId).first();
}

// Token vigente para llamar a la Graph API en nombre del tenant. A
// DIFERENCIA de Mercado Pago, Embedded Signup no entrega un refresh_token
// utilizable por tu backend sin que el admin vuelva a pasar por el popup de
// Facebook — así que si el token expiró, no hay forma automática de
// renovarlo: hay que marcar la conexión 'expired' y pedirle al admin que
// reconecte. Verifica el vencimiento real de tu configuración de Embedded
// Signup (el template "60 Expiration Token" da tokens de 60 días).
export async function getValidWhatsappToken(env, tenantId) {
  const connection = await getWhatsappConnection(env, tenantId);
  if (!connection || connection.connection_status !== 'connected') {
    throw Object.assign(new Error('Este negocio no tiene WhatsApp conectado.'), { code: 'NOT_CONNECTED', status: 409 });
  }
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt < Date.now()) {
    const db = requireDb(env);
    await db.prepare(`UPDATE tenant_whatsapp_connections SET connection_status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`).bind(tenantId).run();
    throw Object.assign(new Error('El token de WhatsApp expiró; reconecta desde el panel.'), { code: 'TOKEN_EXPIRED', status: 409 });
  }
  return decryptSecret(connection.access_token_encrypted, env);
}

// -----------------------------------------------------------------------
// Llamadas a la Graph API (server-to-server, después de Embedded Signup)
// -----------------------------------------------------------------------

// Intercambia el "code" que devuelve el popup de Facebook Login por un
// token de negocio. GET, no POST (así lo documenta Meta para este endpoint).
export async function exchangeCodeForToken(env, code) {
  const url = new URL(graphUrl(env, 'oauth/access_token'));
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('code', code);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo intercambiar el code de WhatsApp.'), { code: 'CODE_EXCHANGE_FAILED', status: 502 });
  }
  return data; // { access_token, token_type, expires_in? }
}

// Registra el número para uso con Cloud API — obligatorio después de
// Embedded Signup, no es automático. El PIN es de 6 dígitos, cualquiera
// (se usa internamente para verificación en dos pasos del número).
export async function registerPhoneNumber(env, phoneNumberId, accessToken) {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const response = await fetch(graphUrl(env, `${phoneNumberId}/register`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo registrar el número de WhatsApp.'), { code: 'PHONE_REGISTER_FAILED', status: 502 });
  }
  return data;
}

// Solo para mostrar el número real en el panel admin — no es necesario
// para enviar/recibir mensajes (eso usa phone_number_id).
export async function fetchDisplayPhoneNumber(env, phoneNumberId, accessToken) {
  try {
    const response = await fetch(graphUrl(env, `${phoneNumberId}?fields=display_phone_number,verified_name`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { displayPhoneNumber: data.display_phone_number || '', businessName: data.verified_name || '' } : { displayPhoneNumber: '', businessName: '' };
  } catch {
    return { displayPhoneNumber: '', businessName: '' };
  }
}

// Suscribe tu app a los webhooks de ESE WABA en particular — sin esto no
// te llegan mensajes aunque el webhook de la app ya esté configurado.
export async function subscribeAppToWaba(env, wabaId, accessToken) {
  const response = await fetch(graphUrl(env, `${wabaId}/subscribed_apps`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo suscribir el webhook al WABA.'), { code: 'SUBSCRIBE_FAILED', status: 502 });
  }
  return data;
}

async function callSendMessage(env, phoneNumberId, accessToken, payload) {
  const response = await fetch(graphUrl(env, `${phoneNumberId}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo enviar el mensaje de WhatsApp.'), { code: 'SEND_FAILED', status: 502, detail: data.error });
  }
  return data;
}

// Mensaje de plantilla (obligatorio para iniciar conversación fuera de la
// ventana de 24h de servicio al cliente — ej. confirmaciones de pedido no
// disparadas por un mensaje reciente del cliente). La plantilla debe
// existir y estar aprobada en WhatsApp Manager antes de usarla aquí.
export async function sendTemplateMessage(env, { phoneNumberId, accessToken, to, templateName, languageCode = 'es_MX', components = [] }) {
  return callSendMessage(env, phoneNumberId, accessToken, {
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

// Texto libre — SOLO permitido dentro de las 24h desde el último mensaje
// del cliente. Fuera de esa ventana, Meta rechaza el envío.
export async function sendTextMessage(env, { phoneNumberId, accessToken, to, body }) {
  return callSendMessage(env, phoneNumberId, accessToken, {
    to,
    type: 'text',
    text: { body },
  });
}

// Lista interactiva (para navegar categorías/productos) — hasta 10 filas.
export async function sendInteractiveList(env, { phoneNumberId, accessToken, to, header, bodyText, buttonLabel, sections }) {
  return callSendMessage(env, phoneNumberId, accessToken, {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: header ? { type: 'text', text: header } : undefined,
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  });
}

// Botones de respuesta rápida (hasta 3) — para confirmar/cancelar, etc.
export async function sendInteractiveButtons(env, { phoneNumberId, accessToken, to, bodyText, buttons }) {
  return callSendMessage(env, phoneNumberId, accessToken, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map((btn) => ({ type: 'reply', reply: { id: btn.id, title: btn.title } })) },
    },
  });
}

export async function markMessageRead(env, { phoneNumberId, accessToken, waMessageId }) {
  try {
    await callSendMessage(env, phoneNumberId, accessToken, { status: 'read', message_id: waMessageId });
  } catch { /* no crítico si falla */ }
}


// -----------------------------------------------------------------------
// Idempotencia de webhooks (mismo patrón que payments.js)
// -----------------------------------------------------------------------
export async function claimWhatsappWebhookEvent(env, providerEventId, { tenantId, eventType } = {}) {
  const db = requireDb(env);
  try {
    await db.prepare(`
      INSERT INTO whatsapp_webhook_events (id, provider_event_id, tenant_id, event_type, processing_status, received_at)
      VALUES (?, ?, ?, ?, 'processing', CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), providerEventId, tenantId || null, eventType || null).run();
    return false;
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) return true;
    throw error;
  }
}

export async function markWhatsappWebhookEventProcessed(env, providerEventId, { status = 'processed', errorMessage = null } = {}) {
  const db = requireDb(env);
  await db.prepare(`
    UPDATE whatsapp_webhook_events SET processing_status = ?, processed_at = CURRENT_TIMESTAMP, error_message = ?
    WHERE provider_event_id = ?
  `).bind(status, errorMessage, providerEventId).run();
}

export async function logWhatsappMessage(env, { tenantId, customerPhone, direction, messageType, waMessageId, content }) {
  const db = requireDb(env);
  try {
    await db.prepare(`
      INSERT INTO whatsapp_messages (id, tenant_id, customer_phone, direction, message_type, wa_message_id, content_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), tenantId, customerPhone, direction, messageType || null, waMessageId || null, JSON.stringify(content || {})).run();
  } catch { /* wa_message_id duplicado (reenvío) — no bloquear el flujo por esto */ }
}

// -----------------------------------------------------------------------
// Notificación de estado de pedido — para llamar desde orders.js,
// checkout/create.js, o el webhook de Mercado Pago cuando se confirma un
// pago. Requiere que exista una PLANTILLA aprobada en WhatsApp Manager con
// ese nombre (no se puede mandar texto libre si el cliente no escribió en
// las últimas 24h) — ver INTEGRACION-WHATSAPP.md para cómo crearla.
//
// Uso esperado (ejemplo, ajusta el nombre/variables de tu plantilla real):
//   await notifyOrderStatus(env, order, 'order_confirmed', [order.order_number, String(order.total)]);
export async function notifyOrderStatus(env, order, templateKey, bodyParams = []) {
  if (!order?.tenant_id || !order?.customer_phone) return { skipped: true, reason: 'missing_order_data' };
  const connection = await getWhatsappConnection(env, order.tenant_id);
  if (!connection || connection.connection_status !== 'connected') return { skipped: true, reason: 'not_connected' };

  const templateEnvKey = `WHATSAPP_TEMPLATE_${templateKey.toUpperCase()}`;
  const templateName = env[templateEnvKey] || templateKey;

  try {
    const accessToken = await getValidWhatsappToken(env, order.tenant_id);
    const components = bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map((value) => ({ type: 'text', text: String(value) })) }]
      : [];
    const result = await sendTemplateMessage(env, {
      phoneNumberId: connection.phone_number_id,
      accessToken,
      to: order.customer_phone,
      templateName,
      components,
    });
    await logWhatsappMessage(env, {
      tenantId: order.tenant_id,
      customerPhone: order.customer_phone,
      direction: 'outbound',
      messageType: `template:${templateName}`,
      waMessageId: result.messages?.[0]?.id,
      content: { templateName, bodyParams, orderId: order.id },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
