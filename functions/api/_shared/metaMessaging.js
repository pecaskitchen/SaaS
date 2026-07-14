import { requireDb } from './http.js';
import { encryptSecret, decryptSecret } from './payments.js';

// -----------------------------------------------------------------------
// Versión de la Graph API — igual que whatsapp.js, Meta deprecha versiones
// viejas en un calendario público. Verifica la vigente antes de desplegar:
// https://developers.facebook.com/docs/graph-api/changelog
// -----------------------------------------------------------------------
function graphVersion(env) {
  return env.META_GRAPH_API_VERSION || 'v22.0';
}

function graphUrl(env, path) {
  return `https://graph.facebook.com/${graphVersion(env)}/${path}`;
}

// -----------------------------------------------------------------------
// Esquema (auto-reparable, mismo patrón que whatsapp.js / payments.js)
// -----------------------------------------------------------------------
export async function ensureMetaMessagingTables(env) {
  const db = requireDb(env);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_meta_page_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      page_id TEXT,
      page_name TEXT,
      page_access_token_encrypted TEXT,
      instagram_business_account_id TEXT,
      instagram_username TEXT,
      connection_status TEXT NOT NULL DEFAULT 'disconnected',
      connected_at TEXT,
      disconnected_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_instagram_login_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      ig_user_id TEXT,
      ig_username TEXT,
      access_token_encrypted TEXT,
      token_expires_at TEXT,
      connection_status TEXT NOT NULL DEFAULT 'disconnected',
      connected_at TEXT,
      disconnected_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta_channel_conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'idle',
      cart_json TEXT NOT NULL DEFAULT '{}',
      order_id INTEGER,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, channel, customer_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta_channel_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_type TEXT,
      provider_message_id TEXT,
      content_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta_channel_webhook_events (
      id TEXT PRIMARY KEY,
      provider_event_id TEXT NOT NULL UNIQUE,
      tenant_id TEXT,
      channel TEXT,
      event_type TEXT,
      processing_status TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      error_message TEXT
    )`),
  ]);
}

// -----------------------------------------------------------------------
// Conexiones por tenant
// -----------------------------------------------------------------------
export async function getMetaPageConnection(env, tenantId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_meta_page_connections WHERE tenant_id = ? LIMIT 1`).bind(tenantId).first();
}

export async function getMetaPageConnectionByPageId(env, pageId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_meta_page_connections WHERE page_id = ? AND connection_status = 'connected' LIMIT 1`).bind(pageId).first();
}

// Busca por instagram_business_account_id, SIN filtrar por
// connection_status, porque justo esta consulta también la usa
// recheck-instagram para detectar Instagram en una conexión que hoy está
// 'connected' solo por Messenger.
export async function getMetaPageConnectionByInstagramId(env, igId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_meta_page_connections WHERE instagram_business_account_id = ? LIMIT 1`).bind(igId).first();
}

export async function getInstagramLoginConnection(env, tenantId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_instagram_login_connections WHERE tenant_id = ? LIMIT 1`).bind(tenantId).first();
}

export async function getInstagramLoginConnectionByIgUserId(env, igUserId) {
  const db = requireDb(env);
  return db.prepare(`SELECT * FROM tenant_instagram_login_connections WHERE ig_user_id = ? AND connection_status = 'connected' LIMIT 1`).bind(igUserId).first();
}

// Punto único para el webhook: dado un id de Instagram que llega en el
// evento (puede ser una cuenta vinculada a una Página, o una cuenta
// standalone conectada via Instagram Login), resuelve a qué tenant
// pertenece y con qué token/endpoint debe responder.
export async function resolveInstagramSender(env, igId) {
  const pageConn = await getMetaPageConnectionByInstagramId(env, igId);
  if (pageConn && pageConn.connection_status === 'connected') {
    return {
      tenantId: pageConn.tenant_id,
      endpointId: pageConn.instagram_business_account_id,
      accessTokenEncrypted: pageConn.page_access_token_encrypted,
    };
  }
  const loginConn = await getInstagramLoginConnectionByIgUserId(env, igId);
  if (loginConn) {
    return {
      tenantId: loginConn.tenant_id,
      endpointId: loginConn.ig_user_id,
      accessTokenEncrypted: loginConn.access_token_encrypted,
    };
  }
  return null;
}

// -----------------------------------------------------------------------
// Facebook Login for Business (Página → Messenger + Instagram vinculado)
// -----------------------------------------------------------------------

// Igual que en whatsapp.js: el popup corre en el navegador, el frontend
// manda el "code" acá para intercambiarlo server-to-server.
export async function exchangePageLoginCode(env, code) {
  const url = new URL(graphUrl(env, 'oauth/access_token'));
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('client_secret', env.META_APP_SECRET);
  url.searchParams.set('code', code);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo intercambiar el code de Facebook Login.'), { code: 'CODE_EXCHANGE_FAILED', status: 400 });
  }
  return data; // { access_token, token_type, expires_in? } -- token de usuario
}

// Lista las Páginas que administra el usuario que acaba de loguearse, con
// el access token PROPIO de cada página (no el de usuario) -- ese es el
// que se usa para enviar mensajes y para leer instagram_business_account.
export async function fetchManagedPages(env, userAccessToken) {
  const url = new URL(graphUrl(env, 'me/accounts'));
  url.searchParams.set('fields', 'id,name,access_token');
  url.searchParams.set('access_token', userAccessToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || 'No se pudieron leer las páginas de Facebook del usuario.'), { code: 'FETCH_PAGES_FAILED', status: 400 });
  }
  return data.data || []; // [{ id, name, access_token }, ...]
}

// NULL si la página no tiene Instagram profesional vinculado -- no es un
// error, es el caso normal para negocios que solo usan Messenger.
export async function fetchInstagramBusinessAccount(env, pageId, pageAccessToken) {
  try {
    const url = new URL(graphUrl(env, `${pageId}`));
    url.searchParams.set('fields', 'instagram_business_account{id,username}');
    url.searchParams.set('access_token', pageAccessToken);
    const response = await fetch(url.toString());
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.instagram_business_account) return { id: null, username: null };
    return { id: data.instagram_business_account.id, username: data.instagram_business_account.username || null };
  } catch {
    return { id: null, username: null };
  }
}

// Suscribe tu app a los webhooks de ESA página en particular -- sin esto
// no llegan mensajes aunque el webhook de la app ya esté configurado.
export async function subscribePageToApp(env, pageId, pageAccessToken, fields = ['messages', 'messaging_postbacks']) {
  const url = new URL(graphUrl(env, `${pageId}/subscribed_apps`));
  url.searchParams.set('subscribed_fields', fields.join(','));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${pageAccessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo suscribir el webhook a la página.'), { code: 'SUBSCRIBE_FAILED', status: 400 });
  }
  return data;
}

// -----------------------------------------------------------------------
// Instagram API with Instagram Login (camino standalone, sin Página)
// -----------------------------------------------------------------------
// NOTA: este flujo vive en endpoints distintos a graph.facebook.com y sus
// nombres de permisos/URLs son un producto más nuevo de Meta que cambia con
// cierta frecuencia -- verifica contra la documentación vigente
// (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
// antes de ir a producción. Implementado aquí con el shape documentado al
// momento de escribir esto.

export async function exchangeInstagramLoginCode(env, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: env.META_IG_APP_ID || env.META_APP_ID,
    client_secret: env.META_IG_APP_SECRET || env.META_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw Object.assign(new Error(data.error_message || 'No se pudo intercambiar el code de Instagram Login.'), { code: 'IG_CODE_EXCHANGE_FAILED', status: 400 });
  }
  return data; // { access_token, user_id } -- token de corta duración
}

// Intercambia el token corto por uno de larga duración (~60 días, igual
// que WhatsApp Embedded Signup: sin refresh automático, hay que reconectar
// al expirar).
export async function exchangeInstagramLongLivedToken(env, shortLivedToken) {
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', env.META_IG_APP_SECRET || env.META_APP_SECRET);
  url.searchParams.set('access_token', shortLivedToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo generar el token de larga duración de Instagram.'), { code: 'IG_LONG_LIVED_FAILED', status: 400 });
  }
  return data; // { access_token, expires_in }
}

export async function fetchInstagramLoginProfile(env, igUserId, accessToken) {
  const url = new URL(`https://graph.instagram.com/${igUserId}`);
  url.searchParams.set('fields', 'user_id,username');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  return { username: data.username || null };
}

// -----------------------------------------------------------------------
// Token vigente para llamar al Send API en nombre del tenant
// -----------------------------------------------------------------------
export async function getValidPageAccessToken(env, tenantId) {
  const connection = await getMetaPageConnection(env, tenantId);
  if (!connection || connection.connection_status !== 'connected') {
    throw Object.assign(new Error('Este negocio no tiene Facebook/Messenger conectado.'), { code: 'NOT_CONNECTED', status: 409 });
  }
  return decryptSecret(connection.page_access_token_encrypted, env);
}

export async function getValidInstagramLoginToken(env, tenantId) {
  const connection = await getInstagramLoginConnection(env, tenantId);
  if (!connection || connection.connection_status !== 'connected') {
    throw Object.assign(new Error('Este negocio no tiene Instagram conectado.'), { code: 'NOT_CONNECTED', status: 409 });
  }
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt < Date.now()) {
    const db = requireDb(env);
    await db.prepare(`UPDATE tenant_instagram_login_connections SET connection_status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`).bind(tenantId).run();
    throw Object.assign(new Error('El token de Instagram expiró; reconecta desde el panel.'), { code: 'TOKEN_EXPIRED', status: 409 });
  }
  return decryptSecret(connection.access_token_encrypted, env);
}

// -----------------------------------------------------------------------
// Send API -- mismo shape para Messenger, Instagram vinculado a una Página
// e Instagram standalone; solo cambia qué {endpointId, accessToken} se les
// pasa (ver metaMessagingBot.js).
// -----------------------------------------------------------------------
async function callSendMessage(env, endpointId, accessToken, payload) {
  const url = new URL(graphUrl(env, `${endpointId}/messages`));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message || 'No se pudo enviar el mensaje.'), { code: 'SEND_FAILED', status: 400, detail: data.error });
  }
  return data;
}

export async function sendText(env, { endpointId, accessToken, to, text }) {
  return callSendMessage(env, endpointId, accessToken, {
    recipient: { id: to },
    message: { text },
  });
}

// Hasta 13 botones de respuesta rápida -- equivalente a los botones
// interactivos de WhatsApp.
export async function sendQuickReplies(env, { endpointId, accessToken, to, text, quickReplies }) {
  return callSendMessage(env, endpointId, accessToken, {
    recipient: { id: to },
    message: {
      text,
      quick_replies: quickReplies.map((qr) => ({ content_type: 'text', title: qr.title, payload: qr.payload })),
    },
  });
}

// Carrusel de tarjetas (hasta 10) -- equivalente a las listas interactivas
// de WhatsApp, para mostrar categorías/productos con botones por tarjeta.
export async function sendGenericTemplate(env, { endpointId, accessToken, to, elements }) {
  return callSendMessage(env, endpointId, accessToken, {
    recipient: { id: to },
    message: {
      attachment: {
        type: 'template',
        payload: { template_type: 'generic', elements },
      },
    },
  });
}

// -----------------------------------------------------------------------
// Verificación de firma de webhook (X-Hub-Signature-256, App Secret) --
// mismo mecanismo que whatsapp.js, copia propia para no importar entre
// módulos de canal distintos.
// -----------------------------------------------------------------------
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyMetaMessagingWebhookSignature(request, env, rawBody) {
  const header = request.headers.get('x-hub-signature-256') || '';
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : '';
  if (!provided || !env.META_APP_SECRET) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.META_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, provided);
}

// -----------------------------------------------------------------------
// Idempotencia de webhooks + log de mensajes (mismo patrón que whatsapp.js)
// -----------------------------------------------------------------------
export async function claimMetaMessagingWebhookEvent(env, providerEventId, { tenantId, channel, eventType } = {}) {
  const db = requireDb(env);
  try {
    await db.prepare(`
      INSERT INTO meta_channel_webhook_events (id, provider_event_id, tenant_id, channel, event_type, processing_status, received_at)
      VALUES (?, ?, ?, ?, ?, 'processing', CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), providerEventId, tenantId || null, channel || null, eventType || null).run();
    return false;
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) return true;
    throw error;
  }
}

export async function markMetaMessagingWebhookEventProcessed(env, providerEventId, { status = 'processed', errorMessage = null } = {}) {
  const db = requireDb(env);
  await db.prepare(`
    UPDATE meta_channel_webhook_events SET processing_status = ?, processed_at = CURRENT_TIMESTAMP, error_message = ?
    WHERE provider_event_id = ?
  `).bind(status, errorMessage, providerEventId).run();
}

export async function logMetaChannelMessage(env, { tenantId, channel, customerId, direction, messageType, providerMessageId, content }) {
  const db = requireDb(env);
  try {
    await db.prepare(`
      INSERT INTO meta_channel_messages (id, tenant_id, channel, customer_id, direction, message_type, provider_message_id, content_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), tenantId, channel, customerId, direction, messageType || null, providerMessageId || null, JSON.stringify(content || {})).run();
  } catch { /* provider_message_id duplicado (reenvío) -- no bloquear el flujo por esto */ }
}

export { encryptSecret };
