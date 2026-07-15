import { jsonResponse, requireDb } from '../_shared/http.js';
import { requireAuth } from '../_shared/auth.js';
import { ensurePlatformTables, safeJson } from '../_shared/platform.js';
import { normalizeTenantSettings } from '../_shared/tenantSettings.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env, []);
  if (!auth.ok) return auth.response;

  const { userId, tenantId, role, name, email } = auth.session;
  let tenant = null;
  if (tenantId && role !== 'platform_admin') {
    try {
      await ensurePlatformTables(env);
      const row = await requireDb(env).prepare(`SELECT id, slug, name, settings_json FROM saas_tenants WHERE id = ? LIMIT 1`)
        .bind(tenantId).first();
      if (row) {
        const settings = safeJson(row.settings_json, {});
        tenant = {
          id: row.id,
          slug: row.slug,
          name: row.name,
          settings: { ...settings, ...normalizeTenantSettings(settings, {}) },
        };
      }
    } catch {
      tenant = null;
    }
  }
  return jsonResponse({ ok: true, user: { id: userId, tenantId, role, name, email, tenant } });
}
