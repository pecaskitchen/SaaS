import { requireAuth } from './_shared/auth.js';
import { actorFromSession, writeAudit } from './_shared/audit.js';
import { jsonResponse, readJson, requireDb } from './_shared/http.js';
import { ensurePlatformTables, safeJson, THEME_PRESETS } from './_shared/platform.js';
import { resolveTenantId } from './_shared/tenant.js';

const PUBLIC_BRAND_FIELDS = [
  'themePreset',
  'displayName',
  'tagline',
  'logoUrl',
  'heroImageUrl',
  'heroEyebrow',
  'heroTitle',
  'heroText',
  'primaryActionLabel',
  'secondaryActionLabel',
  'orderMessageIntro',
  'menuEyebrow',
  'menuTitle',
  'emptyCatalogTitle',
  'emptyCatalogText',
  'primaryColor',
  'accentColor',
];

function pickPublicBrand(input = {}) {
  const brand = {};
  for (const key of PUBLIC_BRAND_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) brand[key] = String(input[key] ?? '').trim();
  }
  if (brand.themePreset && !THEME_PRESETS.includes(brand.themePreset)) brand.themePreset = 'neutral';
  return brand;
}

function normalizeSettingList(value, fallback = []) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : fallback;
}

async function tenantIdForSession(request, env, session) {
  if (session.role === 'platform_admin') return resolveTenantId(request, env);
  return session.tenantId;
}

async function readTenant(env, tenantId) {
  return requireDb(env).prepare(`SELECT * FROM saas_tenants WHERE id = ? OR slug = ? LIMIT 1`).bind(tenantId, tenantId).first();
}

function publicTenantConfig(tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    brand: safeJson(tenant.brand_json, {}),
    settings: safeJson(tenant.settings_json, {}),
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'manager', 'platform_admin']);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);

    const tenantId = await tenantIdForSession(request, env, auth.session);
    const tenant = await readTenant(env, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Negocio no encontrado.' }, 404);

    return jsonResponse({ ok: true, tenant: publicTenantConfig(tenant) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar configuracion.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'manager', 'platform_admin']);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);

    const tenantId = await tenantIdForSession(request, env, auth.session);
    const tenant = await readTenant(env, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Negocio no encontrado.' }, 404);

    const body = await readJson(request);
    const currentBrand = safeJson(tenant.brand_json, {});
    const currentSettings = safeJson(tenant.settings_json, {});
    const incomingSettings = body.settings || {};

    const nextBrand = {
      ...currentBrand,
      ...pickPublicBrand(body.brand || {}),
    };
    if (!THEME_PRESETS.includes(nextBrand.themePreset)) nextBrand.themePreset = 'neutral';

    const nextSettings = {
      ...currentSettings,
      timezone: String(incomingSettings.timezone || currentSettings.timezone || 'America/Mexico_City').trim(),
      whatsappNumber: String(incomingSettings.whatsappNumber || currentSettings.whatsappNumber || '').trim(),
      supportEmail: String(incomingSettings.supportEmail || currentSettings.supportEmail || '').trim(),
      paymentMethods: normalizeSettingList(incomingSettings.paymentMethods, currentSettings.paymentMethods || ['Efectivo', 'Transferencia', 'Mercado Pago']),
      fulfillmentTypes: normalizeSettingList(incomingSettings.fulfillmentTypes, currentSettings.fulfillmentTypes || ['Recoger', 'Entrega a domicilio']),
      orderSources: normalizeSettingList(incomingSettings.orderSources, currentSettings.orderSources || ['Tienda', 'WhatsApp', 'Facebook', 'Instagram', 'Llamada']),
    };

    await requireDb(env).prepare(`
      UPDATE saas_tenants
      SET brand_json = ?, settings_json = ?, updated_at_utc = ?
      WHERE id = ?
    `).bind(JSON.stringify(nextBrand), JSON.stringify(nextSettings), new Date().toISOString(), tenant.id).run();

    await writeAudit(env, {
      tenantId: tenant.id,
      ...actorFromSession(auth.session),
      action: 'tenant.public_config.updated',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: { changedBy: 'business_config' },
    });

    const updated = await readTenant(env, tenant.id);
    return jsonResponse({ ok: true, tenant: publicTenantConfig(updated) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar configuracion.', detail: error.message }, 500);
  }
}
