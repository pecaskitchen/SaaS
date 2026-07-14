import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { resolveIntegrationTenantIdFromBody } from '../../_shared/integrationAuth.js';
import { ensureMetaMessagingTables } from '../../_shared/metaMessaging.js';

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const body = await readJson(request);
    const tenantId = resolveIntegrationTenantIdFromBody(auth, body);
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    await ensureMetaMessagingTables(env);

    // Instagram API with Instagram Login no tiene un endpoint de
    // "desuscribir" separado como las Páginas -- alcanza con limpiar el
    // token localmente, el webhook simplemente no va a encontrar conexión
    // activa para ese ig_user_id.
    await db.prepare(`
      UPDATE tenant_instagram_login_connections
      SET connection_status = 'disconnected', access_token_encrypted = NULL, token_expires_at = NULL,
          disconnected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(tenantId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo desconectar Instagram.', detail: error.message }, 500);
  }
}
