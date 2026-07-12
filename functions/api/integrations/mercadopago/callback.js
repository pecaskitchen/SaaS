import { jsonResponse, requireDb } from '../../_shared/http.js';
import { ensurePaymentTables, decryptSecret, encryptSecret, sha256Hex } from '../../_shared/payments.js';

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

function adminRedirect(env, params) {
  const base = String(env.APP_URL || '').replace(/\/+$/, '');
  const query = new URLSearchParams(params).toString();
  return Response.redirect(`${base}/?${query}#admin`, 302);
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      return adminRedirect(env, { mp: 'error', reason: oauthError });
    }
    if (!code || !state) {
      return adminRedirect(env, { mp: 'error', reason: 'missing_code_or_state' });
    }

    const db = requireDb(env);
    await ensurePaymentTables(env);

    const stateHash = await sha256Hex(state);
    const session = await db.prepare(
      `SELECT * FROM oauth_sessions WHERE state_hash = ? AND provider = 'mercado_pago' LIMIT 1`
    ).bind(stateHash).first();

    if (!session) return adminRedirect(env, { mp: 'error', reason: 'invalid_state' });
    if (session.used_at) return adminRedirect(env, { mp: 'error', reason: 'state_already_used' });
    if (new Date(session.expires_at).getTime() < Date.now()) return adminRedirect(env, { mp: 'error', reason: 'state_expired' });

    // Marcar usado de inmediato — el state es de un solo uso sin importar
    // si el intercambio de abajo termina bien o mal.
    await db.prepare(`UPDATE oauth_sessions SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(session.id).run();

    const codeVerifier = await decryptSecret(session.code_verifier_encrypted, env);

    const tokenResponse = await fetch(MP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.MP_CLIENT_ID,
        client_secret: env.MP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.MP_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenData.access_token) {
      await db.prepare(`
        UPDATE tenant_payment_connections SET connection_status = 'error', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND provider = 'mercado_pago'
      `).bind(session.tenant_id).run();
      return adminRedirect(env, { mp: 'error', reason: 'token_exchange_failed' });
    }

    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 21600) * 1000).toISOString();

    await db.prepare(`
      INSERT INTO tenant_payment_connections (
        id, tenant_id, provider, provider_user_id, public_key,
        access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes,
        connection_status, connected_at, disconnected_at, created_at, updated_at
      ) VALUES (?, ?, 'mercado_pago', ?, ?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, provider) DO UPDATE SET
        provider_user_id = excluded.provider_user_id,
        public_key = excluded.public_key,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        scopes = excluded.scopes,
        connection_status = 'connected',
        connected_at = CURRENT_TIMESTAMP,
        disconnected_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      crypto.randomUUID(),
      session.tenant_id,
      String(tokenData.user_id || ''),
      tokenData.public_key || null,
      await encryptSecret(tokenData.access_token, env),
      await encryptSecret(tokenData.refresh_token, env),
      expiresAt,
      tokenData.scope || null,
    ).run();

    return adminRedirect(env, { mp: 'connected' });
  } catch (error) {
    // No exponemos error.message al navegador del admin en la URL (podria
    // filtrar detalles internos); solo se loguea via el status genérico.
    return adminRedirect(env, { mp: 'error', reason: 'unexpected_error' });
  }
}
