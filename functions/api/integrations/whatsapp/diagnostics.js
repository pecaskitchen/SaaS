import { jsonResponse, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { resolveIntegrationTenantIdFromQuery } from '../../_shared/integrationAuth.js';
import { ensureWhatsappTables, getWhatsappConnection } from '../../_shared/whatsapp.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;
    const tenantId = resolveIntegrationTenantIdFromQuery(auth, request);
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);
    await ensureWhatsappTables(env);
    const db = requireDb(env);
    const [connection, events, messages, recent] = await Promise.all([
      getWhatsappConnection(env, tenantId),
      db.prepare(`SELECT COUNT(*) received, SUM(CASE WHEN processing_status = 'processed' THEN 1 ELSE 0 END) processed, SUM(CASE WHEN processing_status = 'error' THEN 1 ELSE 0 END) errors, COALESCE(SUM(duplicate_count), 0) duplicates FROM whatsapp_webhook_events WHERE tenant_id = ? AND received_at >= datetime('now', '-24 hours')`).bind(tenantId).first(),
      db.prepare(`SELECT SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) inbound, SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) outbound FROM whatsapp_messages WHERE tenant_id = ? AND created_at >= datetime('now', '-24 hours')`).bind(tenantId).first(),
      db.prepare(`SELECT event_type, processing_status, received_at, processed_at, duplicate_count, error_message FROM whatsapp_webhook_events WHERE tenant_id = ? ORDER BY received_at DESC LIMIT 10`).bind(tenantId).all(),
    ]);
    return jsonResponse({ ok: true, generatedAt: new Date().toISOString(), connection: { status: connection?.connection_status || 'disconnected', displayPhoneNumber: connection?.display_phone_number || null }, last24Hours: { received: Number(events?.received || 0), processed: Number(events?.processed || 0), errors: Number(events?.errors || 0), duplicatesIgnored: Number(events?.duplicates || 0), inbound: Number(messages?.inbound || 0), outbound: Number(messages?.outbound || 0) }, recentEvents: recent.results || [] });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo generar el diagnóstico de WhatsApp.', detail: error.message }, 500);
  }
}
