import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { decryptSecret } from '../../_shared/payments.js';
import { ensureMetaMessagingTables, getMetaPageConnection, fetchInstagramBusinessAccount } from '../../_shared/metaMessaging.js';

// Para cuando el cliente vincula Instagram a su Página DESPUÉS de haber
// conectado Messenger -- vuelve a consultar instagram_business_account con
// el mismo token de página ya guardado, sin repetir el login de Facebook.
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

    await ensureMetaMessagingTables(env);
    const connection = await getMetaPageConnection(env, tenantId);
    if (!connection || connection.connection_status !== 'connected') {
      return jsonResponse({ ok: false, error: 'Conecta Facebook/Messenger primero.' }, 409);
    }

    const pageAccessToken = await decryptSecret(connection.page_access_token_encrypted, env);
    const instagram = await fetchInstagramBusinessAccount(env, connection.page_id, pageAccessToken);

    const db = requireDb(env);
    await db.prepare(`
      UPDATE tenant_meta_page_connections
      SET instagram_business_account_id = ?, instagram_username = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(instagram.id, instagram.username, tenantId).run();

    return jsonResponse({ ok: true, instagramLinked: Boolean(instagram.id), instagramUsername: instagram.username });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo revisar Instagram.', detail: error.message }, 500);
  }
}
