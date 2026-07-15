import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, requireDb } from '../_shared/http.js';
import { ensurePlatformTables } from '../_shared/platform.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);
    const db = requireDb(env);
    const tenantCounts = await db.prepare(`SELECT status, COUNT(*) AS count FROM saas_tenants GROUP BY status`).all();
    const planCounts = await db.prepare(`SELECT plan, COUNT(*) AS count FROM saas_tenants GROUP BY plan`).all();
    const recentAudit = await db.prepare(`SELECT * FROM audit_log ORDER BY created_at_utc DESC LIMIT 20`).all();
    return jsonResponse({
      ok: true,
      tenantCounts: tenantCounts.results || [],
      planCounts: planCounts.results || [],
      recentAudit: recentAudit.results || [],
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar el dashboard.', detail: error.message }, 500);
  }
}
