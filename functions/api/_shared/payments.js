import { requireDb } from './http.js';

// -----------------------------------------------------------------------
// Cifrado de tokens (AES-256-GCM)
// -----------------------------------------------------------------------
// env.PAYMENT_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en
// base64 (ej. generada con `openssl rand -base64 32`). Nunca la subas a
// git — se configura como secreto de Cloudflare:
//   wrangler secret put PAYMENT_TOKEN_ENCRYPTION_KEY

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey(env) {
  const raw = env.PAYMENT_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Falta configurar PAYMENT_TOKEN_ENCRYPTION_KEY.');
  const keyBytes = base64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error('PAYMENT_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.');
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext, env) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = await importEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(plaintext)));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

export async function decryptSecret(stored, env) {
  if (!stored) return null;
  const [version, ivB64, ciphertextB64] = String(stored).split(':');
  if (version !== 'v1' || !ivB64 || !ciphertextB64) throw new Error('Formato de secreto cifrado invalido.');
  const key = await importEncryptionKey(env);
  const iv = base64ToBytes(ivB64);
  const ciphertext = base64ToBytes(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// -----------------------------------------------------------------------
// PKCE (RFC 7636) — Mercado Pago lo recomienda para el intercambio del
// authorization code en el flujo OAuth Marketplace.
// -----------------------------------------------------------------------

function base64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateCodeVerifier() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function deriveCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

export function generateState() {
  return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------------------------
// Esquema (auto-reparable, mismo patrón que el resto del backend)
// -----------------------------------------------------------------------

export async function ensurePaymentTables(env) {
  const db = requireDb(env);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tenant_payment_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'mercado_pago',
      provider_user_id TEXT,
      public_key TEXT,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      token_expires_at TEXT,
      scopes TEXT,
      connection_status TEXT NOT NULL DEFAULT 'disconnected',
      connected_at TEXT,
      disconnected_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, provider)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      state_hash TEXT NOT NULL UNIQUE,
      code_verifier_encrypted TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_event_id TEXT NOT NULL,
      tenant_id TEXT,
      event_type TEXT,
      resource_id TEXT,
      processing_status TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      error_message TEXT,
      UNIQUE(provider, provider_event_id)
    )`),
  ]);
  // Columnas nuevas en orders — cada ALTER falla silenciosamente si ya
  // existe (SQLite no soporta "ADD COLUMN IF NOT EXISTS").
  const newColumns = [
    'payment_provider TEXT',
    'payment_preference_id TEXT',
    'provider_payment_id TEXT',
    'provider_merchant_order_id TEXT',
    'payment_amount INTEGER',
    'marketplace_fee INTEGER DEFAULT 0',
    'paid_at TEXT',
  ];
  for (const column of newColumns) {
    try { await db.prepare(`ALTER TABLE orders ADD COLUMN ${column}`).run(); } catch { /* ya existe */ }
  }
}

// -----------------------------------------------------------------------
// Acceso a la conexión de pago del tenant
// -----------------------------------------------------------------------

export async function getPaymentConnection(env, tenantId, provider = 'mercado_pago') {
  const db = requireDb(env);
  return db.prepare(
    `SELECT * FROM tenant_payment_connections WHERE tenant_id = ? AND provider = ? LIMIT 1`
  ).bind(tenantId, provider).first();
}

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

// Devuelve un access_token vigente para el tenant, renovándolo con el
// refresh_token si esta por expirar. Nunca expone el token al cliente —
// solo se usa server-side para llamar a la API de Mercado Pago.
export async function getValidAccessToken(env, tenantId, provider = 'mercado_pago') {
  const db = requireDb(env);
  const connection = await getPaymentConnection(env, tenantId, provider);
  if (!connection || connection.connection_status !== 'connected') {
    throw Object.assign(new Error('Este negocio no tiene pagos en linea habilitados.'), { code: 'NOT_CONNECTED', status: 409 });
  }

  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < 5 * 60 * 1000; // renovar 5 min antes

  if (!needsRefresh) {
    return decryptSecret(connection.access_token_encrypted, env);
  }

  // Control de concurrencia simple: si otra petición ya está renovando
  // (connection_status pasó a 'connecting' hace <30s), reintenta leer en
  // vez de disparar una segunda renovación en paralelo.
  if (connection.connection_status === 'connecting') {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const refreshed = await getPaymentConnection(env, tenantId, provider);
    if (refreshed && refreshed.connection_status === 'connected' && refreshed.token_expires_at && new Date(refreshed.token_expires_at).getTime() - Date.now() > 0) {
      return decryptSecret(refreshed.access_token_encrypted, env);
    }
  }

  const refreshToken = await decryptSecret(connection.refresh_token_encrypted, env);
  if (!refreshToken) throw Object.assign(new Error('No hay refresh_token guardado; reconecta Mercado Pago.'), { code: 'NO_REFRESH_TOKEN', status: 409 });

  const response = await fetch(MP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.MP_CLIENT_ID,
      client_secret: env.MP_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    await db.prepare(`UPDATE tenant_payment_connections SET connection_status = 'error', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND provider = ?`)
      .bind(tenantId, provider).run();
    throw Object.assign(new Error(data.message || 'No se pudo renovar el token de Mercado Pago.'), { code: 'REFRESH_FAILED', status: 502 });
  }

  const newExpiresAt = new Date(Date.now() + Number(data.expires_in || 21600) * 1000).toISOString();
  await db.prepare(`
    UPDATE tenant_payment_connections
    SET access_token_encrypted = ?, refresh_token_encrypted = ?, token_expires_at = ?, connection_status = 'connected', updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND provider = ?
  `).bind(
    await encryptSecret(data.access_token, env),
    await encryptSecret(data.refresh_token || refreshToken, env),
    newExpiresAt,
    tenantId,
    provider,
  ).run();

  return data.access_token;
}

// -----------------------------------------------------------------------
// Idempotencia de webhooks
// -----------------------------------------------------------------------

// Devuelve true si el evento ya se proceso (o esta en proceso) — el
// llamador debe responder 200 y no reprocesar. Si es nuevo, lo marca como
// 'processing' y devuelve false.
export async function claimWebhookEvent(env, { provider, providerEventId, tenantId, eventType, resourceId }) {
  const db = requireDb(env);
  try {
    await db.prepare(`
      INSERT INTO payment_webhook_events (id, provider, provider_event_id, tenant_id, event_type, resource_id, processing_status, received_at)
      VALUES (?, ?, ?, ?, ?, ?, 'processing', CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), provider, providerEventId, tenantId || null, eventType || null, resourceId || null).run();
    return false; // es nuevo, no estaba reclamado
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) return true; // ya existia
    throw error;
  }
}

export async function markWebhookEventProcessed(env, providerEventId, provider, { status = 'processed', errorMessage = null } = {}) {
  const db = requireDb(env);
  await db.prepare(`
    UPDATE payment_webhook_events
    SET processing_status = ?, processed_at = CURRENT_TIMESTAMP, error_message = ?
    WHERE provider = ? AND provider_event_id = ?
  `).bind(status, errorMessage, provider, providerEventId).run();
}
