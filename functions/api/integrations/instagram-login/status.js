import { jsonResponse } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { resolveIntegrationTenantIdFromQuery } from '../../_shared/integrationAuth.js';
import { ensureMetaMessagingTables, getInstagramLoginConnection } from '../../_shared/metaMessaging.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const tenantId = resolveIntegrationTenantIdFromQuery(auth, request);
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    await ensureMetaMessagingTables(env);
    const connection = await getInstagramLoginConnection(env, tenantId);

    return jsonResponse({
      ok: true,
      connected: connection?.connection_status === 'connected',
      status: connection?.connection_status || 'disconnected',
      username: connection?.ig_username || null,
      connectedAt: connection?.connected_at || null,
      tokenExpiresAt: connection?.token_expires_at || null,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo obtener el estado de Instagram.', detail: error.message }, 500);
  }
}
