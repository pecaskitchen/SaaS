import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { encryptSecret } from '../../_shared/payments.js';
import {
  ensureMetaMessagingTables,
  exchangePageLoginCode,
  fetchManagedPages,
  fetchInstagramBusinessAccount,
  subscribePageToApp,
} from '../../_shared/metaMessaging.js';

// El popup de Facebook Login for Business corre ENTERAMENTE en el
// navegador -- el frontend llama a este endpoint DESPUÉS de que el popup
// termina, con el "code" que devolvió el SDK de Facebook. Mismo patrón que
// integrations/whatsapp/complete.js.
//
// LIMITACIÓN CONOCIDA: si el usuario administra más de una Página de
// Facebook, se conecta automáticamente la PRIMERA que devuelve la Graph
// API (`/me/accounts`) -- todavía no hay un selector de página en el
// panel. Para negocios con una sola página (el caso típico de un cliente
// como Pecas) esto no es un problema.
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

    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);
    if (!code) return jsonResponse({ ok: false, error: 'Falta el code del login de Facebook.' }, 400);

    const db = requireDb(env);
    await ensureMetaMessagingTables(env);

    await db.prepare(`
      INSERT INTO tenant_meta_page_connections (id, tenant_id, connection_status, created_at, updated_at)
      VALUES (?, ?, 'connecting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id) DO UPDATE SET connection_status = 'connecting', updated_at = CURRENT_TIMESTAMP
    `).bind(crypto.randomUUID(), tenantId).run();

    const tokenData = await exchangePageLoginCode(env, code);
    const pages = await fetchManagedPages(env, tokenData.access_token);
    if (!pages.length) {
      return jsonResponse({ ok: false, error: 'Tu usuario de Facebook no administra ninguna Página. Crea o pide acceso a la Página del negocio primero.' }, 409);
    }

    const page = pages[0];
    await subscribePageToApp(env, page.id, page.access_token);
    const instagram = await fetchInstagramBusinessAccount(env, page.id, page.access_token);

    await db.prepare(`
      UPDATE tenant_meta_page_connections
      SET page_id = ?, page_name = ?, page_access_token_encrypted = ?,
          instagram_business_account_id = ?, instagram_username = ?,
          connection_status = 'connected', connected_at = CURRENT_TIMESTAMP, disconnected_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(page.id, page.name, await encryptSecret(page.access_token, env), instagram.id, instagram.username, tenantId).run();

    return jsonResponse({ ok: true, pageName: page.name, instagramLinked: Boolean(instagram.id), instagramUsername: instagram.username });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo completar la conexión de Facebook/Messenger.' }, error.status || 500);
  }
}
