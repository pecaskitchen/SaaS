import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import {
  ensurePaymentTables,
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  sha256Hex,
  encryptSecret,
} from '../../_shared/payments.js';

const OAUTH_SESSION_TTL_SECONDS = 60 * 10; // 10 minutos para completar el login en Mercado Pago

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    // El tenant_id SIEMPRE sale de la sesión verificada, nunca de lo que
    // mande el cliente — con una única excepción: platform_admin, cuyo rol
    // ya fue verificado por requireAuth y que legítimamente administra
    // conexiones de cualquier tenant (ej. para dar soporte).
    let tenantId = auth.session.tenantId;
    if (auth.session.role === 'platform_admin') {
      const body = await readJson(request);
      tenantId = String(body.tenantId || tenantId || '').trim();
      if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);
    }

    if (!env.MP_CLIENT_ID || !env.MP_REDIRECT_URI) {
      return jsonResponse({ ok: false, error: 'Mercado Pago no esta configurado en este servidor (faltan MP_CLIENT_ID / MP_REDIRECT_URI).' }, 500);
    }

    const db = requireDb(env);
    await ensurePaymentTables(env);

    const state = generateState();
    const verifier = generateCodeVerifier();
    const challenge = await deriveCodeChallenge(verifier);
    const expiresAt = new Date(Date.now() + OAUTH_SESSION_TTL_SECONDS * 1000).toISOString();

    await db.prepare(`
      INSERT INTO oauth_sessions (id, tenant_id, provider, state_hash, code_verifier_encrypted, expires_at, created_at)
      VALUES (?, ?, 'mercado_pago', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), tenantId, await sha256Hex(state), await encryptSecret(verifier, env), expiresAt).run();

    // Refleja "conectando..." en el panel mientras el admin completa el
    // login en Mercado Pago, sin tocar tokens todavia.
    await db.prepare(`
      INSERT INTO tenant_payment_connections (id, tenant_id, provider, connection_status, created_at, updated_at)
      VALUES (?, ?, 'mercado_pago', 'connecting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, provider) DO UPDATE SET connection_status = 'connecting', updated_at = CURRENT_TIMESTAMP
    `).bind(crypto.randomUUID(), tenantId).run();

    const authorizationUrl = new URL('https://auth.mercadopago.com/authorization');
    authorizationUrl.searchParams.set('client_id', env.MP_CLIENT_ID);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('platform_id', 'mp');
    authorizationUrl.searchParams.set('redirect_uri', env.MP_REDIRECT_URI);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    return jsonResponse({ ok: true, authorizationUrl: authorizationUrl.toString() });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo iniciar la conexion con Mercado Pago.', detail: error.message }, 500);
  }
}
