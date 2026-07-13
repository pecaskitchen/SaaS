import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { encryptSecret } from '../../_shared/payments.js';
import {
  ensureMetaMessagingTables,
  exchangeInstagramLoginCode,
  exchangeInstagramLongLivedToken,
  fetchInstagramLoginProfile,
} from '../../_shared/metaMessaging.js';

// El frontend llega acá DESPUÉS de que instagram.com redirigió de vuelta a
// tu redirect_uri con ?code=... -- ese code se lo pasa a este endpoint tal
// cual (junto con el mismo redirect_uri usado para pedirlo, Instagram lo
// exige para validar el intercambio).
export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const body = await readJson(request);
    let tenantId = auth.session.tenantId;
    if (auth.session.role === 'platform_admin') {
      tenantId = String(body.tenantId || tenantId || '').trim();
    }
    const code = String(body.code || '').trim();
    const redirectUri = String(body.redirectUri || env.META_IG_REDIRECT_URI || '').trim();

    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);
    if (!code) return jsonResponse({ ok: false, error: 'Falta el code de Instagram.' }, 400);

    const db = requireDb(env);
    await ensureMetaMessagingTables(env);

    await db.prepare(`
      INSERT INTO tenant_instagram_login_connections (id, tenant_id, connection_status, created_at, updated_at)
      VALUES (?, ?, 'connecting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id) DO UPDATE SET connection_status = 'connecting', updated_at = CURRENT_TIMESTAMP
    `).bind(crypto.randomUUID(), tenantId).run();

    const shortLived = await exchangeInstagramLoginCode(env, code, redirectUri);
    const longLived = await exchangeInstagramLongLivedToken(env, shortLived.access_token);
    const profile = await fetchInstagramLoginProfile(env, shortLived.user_id, longLived.access_token);

    const expiresInSeconds = Number(longLived.expires_in || 60 * 24 * 60 * 60);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    await db.prepare(`
      UPDATE tenant_instagram_login_connections
      SET ig_user_id = ?, ig_username = ?, access_token_encrypted = ?, token_expires_at = ?,
          connection_status = 'connected', connected_at = CURRENT_TIMESTAMP, disconnected_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(String(shortLived.user_id), profile.username, await encryptSecret(longLived.access_token, env), expiresAt, tenantId).run();

    return jsonResponse({ ok: true, username: profile.username });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo completar la conexión de Instagram.' }, error.status || 500);
  }
}
