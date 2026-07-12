import { jsonResponse } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { ensurePaymentTables, getPaymentConnection } from '../../_shared/payments.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    let tenantId = auth.session.tenantId;
    if (auth.session.role === 'platform_admin') {
      const url = new URL(request.url);
      tenantId = url.searchParams.get('tenantId') || tenantId;
    }
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    await ensurePaymentTables(env);
    const connection = await getPaymentConnection(env, tenantId, 'mercado_pago');

    // Nunca se devuelven los tokens cifrados al cliente — solo el estado.
    return jsonResponse({
      ok: true,
      connected: connection?.connection_status === 'connected',
      status: connection?.connection_status || 'disconnected',
      connectedAt: connection?.connected_at || null,
      providerUserId: connection?.provider_user_id || null,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo obtener el estado de la conexion.', detail: error.message }, 500);
  }
}
