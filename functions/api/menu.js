import { jsonResponse, requireDb } from '../../00-sin-cambio/functions/api/_shared/http.js';
import { requireTenant } from './_shared/tenant.js';
import { safeJson } from '../../00-sin-cambio/functions/api/_shared/ids.js';

export async function onRequestGet({ request, env }) {
  try {
    const tenantResult = await requireTenant(request, env);
    if (!tenantResult.ok) return tenantResult.response;

    const db = requireDb(env);
    const row = await db.prepare(`SELECT * FROM tenant_settings WHERE tenant_id = ?`)
      .bind(tenantResult.tenant.id)
      .first();

    return jsonResponse({
      ok: true,
      tenant: {
        id: tenantResult.tenant.id,
        slug: tenantResult.tenant.slug,
        name: tenantResult.tenant.name,
        brand: safeJson(tenantResult.tenant.brand_json, {}),
      },
      ...(safeJson(row?.menu_json, {})),
      businessHours: safeJson(row?.business_hours_json, null),
      branchSettings: safeJson(row?.branch_settings_json, null),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar el menu.', detail: error.message }, 500);
  }
}
