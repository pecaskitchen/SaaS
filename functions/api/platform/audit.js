import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, requireDb } from '../_shared/http.js';
import { ensureAuditTables } from '../_shared/audit.js';

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;

    await ensureAuditTables(env);
    const url = new URL(request.url);
    const tenantId = String(url.searchParams.get('tenant_id') || '').trim();
    const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const db = requireDb(env);

    const result = tenantId
      ? await db.prepare(`
          SELECT * FROM audit_log
          WHERE tenant_id = ?
          ORDER BY created_at_utc DESC
          LIMIT ?
        `).bind(tenantId, limit).all()
      : await db.prepare(`
          SELECT * FROM audit_log
          ORDER BY created_at_utc DESC
          LIMIT ?
        `).bind(limit).all();

    const events = (result.results || []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id || '',
      actorRole: row.actor_role,
      actorName: row.actor_name || '',
      action: row.action,
      entityType: row.entity_type || '',
      entityId: row.entity_id || '',
      metadata: safeJson(row.metadata_json, {}),
      createdAtUtc: row.created_at_utc,
    }));

    return jsonResponse({ ok: true, events });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar auditoria.', detail: error.message }, 500);
  }
}

