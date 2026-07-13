import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { decryptSecret } from '../../_shared/payments.js';
import { ensureWhatsappTables, getWhatsappConnection } from '../../_shared/whatsapp.js';

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
    await ensureWhatsappTables(env);

    const connection = await getWhatsappConnection(env, tenantId);
    if (connection?.waba_id && connection?.access_token_encrypted) {
      try {
        const accessToken = await decryptSecret(connection.access_token_encrypted, env);
        await fetch(graphUrl(env, `${connection.waba_id}/subscribed_apps`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch { /* si falla la desuscripción remota, igual limpiamos localmente */ }
    }

    await db.prepare(`
      UPDATE tenant_whatsapp_connections
      SET connection_status = 'disconnected', access_token_encrypted = NULL, token_expires_at = NULL,
          disconnected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(tenantId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo desconectar WhatsApp.', detail: error.message }, 500);
  }
}
