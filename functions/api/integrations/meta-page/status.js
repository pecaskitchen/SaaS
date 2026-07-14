import { jsonResponse } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { resolveIntegrationTenantIdFromQuery } from '../../_shared/integrationAuth.js';
import { ensureMetaMessagingTables, getMetaPageConnection } from '../../_shared/metaMessaging.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const tenantId = resolveIntegrationTenantIdFromQuery(auth, request);
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    await ensureMetaMessagingTables(env);
    const connection = await getMetaPageConnection(env, tenantId);

    return jsonResponse({
      ok: true,
      connected: connection?.connection_status === 'connected',
      status: connection?.connection_status || 'disconnected',
      pageName: connection?.page_name || null,
      instagramLinked: Boolean(connection?.instagram_business_account_id),
      instagramUsername: connection?.instagram_username || null,
      connectedAt: connection?.connected_at || null,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo obtener el estado de Facebook/Messenger.', detail: error.message }, 500);
  }
}
