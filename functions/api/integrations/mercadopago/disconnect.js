import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { resolveIntegrationTenantIdFromBody } from '../../_shared/integrationAuth.js';
import { ensurePaymentTables } from '../../_shared/payments.js';

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const body = await readJson(request);
    const tenantId = resolveIntegrationTenantIdFromBody(auth, body);
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    await ensurePaymentTables(env);

    // Se limpian los tokens cifrados (no solo se marca desconectado) para
    // reducir la superficie si la fila llegara a filtrarse por otra vía.
    await db.prepare(`
      UPDATE tenant_payment_connections
      SET connection_status = 'disconnected',
          access_token_encrypted = NULL,
          refresh_token_encrypted = NULL,
          token_expires_at = NULL,
          disconnected_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND provider = 'mercado_pago'
    `).bind(tenantId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo desconectar Mercado Pago.', detail: error.message }, 500);
  }
}
