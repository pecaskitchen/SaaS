import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { decryptSecret } from '../../_shared/payments.js';
import { ensureMetaMessagingTables, getMetaPageConnection } from '../../_shared/metaMessaging.js';

function graphUrl(env, path) {
  return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION || 'v22.0'}/${path}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    let tenantId = auth.session.tenantId;
    if (auth.session.role === 'platform_admin') {
      const body = await readJson(request);
      tenantId = String(body.tenantId || tenantId || '').trim();
    }
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    await ensureMetaMessagingTables(env);

    const connection = await getMetaPageConnection(env, tenantId);
    if (connection?.page_id && connection?.page_access_token_encrypted) {
      try {
        const accessToken = await decryptSecret(connection.page_access_token_encrypted, env);
        await fetch(graphUrl(env, `${connection.page_id}/subscribed_apps`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch { /* si falla la desuscripción remota, igual limpiamos localmente */ }
    }

    await db.prepare(`
      UPDATE tenant_meta_page_connections
      SET connection_status = 'disconnected', page_access_token_encrypted = NULL,
          instagram_business_account_id = NULL, instagram_username = NULL,
          disconnected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(tenantId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo desconectar Facebook/Messenger.', detail: error.message }, 500);
  }
}
