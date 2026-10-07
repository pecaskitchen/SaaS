import { jsonResponse, requireDb } from './_shared/http.js';
import { resolveTenantId, UNRESOLVED_TENANT_ID } from './_shared/tenant.js';

const EVENTS = new Set(['web_vitals', 'client_error']);

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS client_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    path TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at_utc TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_client_telemetry_tenant_created ON client_telemetry(tenant_id, created_at_utc)`).run();
}

export async function onRequestPost({ request, env }) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 4096) return jsonResponse({ ok: false }, 413);
    const tenantId = await resolveTenantId(request, env);
    if (tenantId === UNRESOLVED_TENANT_ID) return jsonResponse({ ok: false }, 404);
    const body = await request.json().catch(() => ({}));
    if (!EVENTS.has(body.event)) return jsonResponse({ ok: false }, 400);
    const path = String(body.path || '/').slice(0, 160).replace(/[?#].*$/, '');
    const payload = JSON.stringify(body.data && typeof body.data === 'object' ? body.data : {}).slice(0, 2500);
    const db = requireDb(env);
    await ensureTable(db);
    await db.prepare(`INSERT INTO client_telemetry (tenant_id, event_type, path, payload_json, created_at_utc) VALUES (?, ?, ?, ?, ?)`)
      .bind(tenantId, body.event, path, payload, new Date().toISOString()).run();
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
