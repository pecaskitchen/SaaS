import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { ensurePlatformTables, safeJson, updateTenant } from '../_shared/platform.js';
import { writeAudit } from '../_shared/audit.js';
import { normalizeTenantSettings } from '../_shared/tenantSettings.js';

const PUBLIC_BRAND_FIELDS = [
  'themePreset',
  'displayName',
  'tagline',
  'pageTitle',
  'metaDescription',
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
  return brand;
}

function normalizeSettingList(value, fallback = []) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : fallback;
}

async function readTenant(db, tenantId) {
  return db.prepare(`SELECT * FROM saas_tenants WHERE id = ? OR slug = ? LIMIT 1`).bind(tenantId, tenantId).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);

    const tenantId = String(new URL(request.url).searchParams.get('tenant_id') || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenant_id.' }, 400);

    const db = requireDb(env);
    const tenant = await readTenant(db, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Cliente no encontrado.' }, 404);

    const settings = safeJson(tenant.settings_json, {});

    return jsonResponse({
      ok: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        legalName: tenant.legal_name || '',
        contactName: tenant.contact_name || '',
        contactEmail: tenant.contact_email || '',
        contactPhone: tenant.contact_phone || '',
        status: tenant.status,
        plan: tenant.plan,
        domain: tenant.domain || '',
        subdomain: tenant.subdomain || '',
        brand: safeJson(tenant.brand_json, {}),
        settings: { ...settings, ...normalizeTenantSettings(settings, {}) },
        notes: tenant.notes || '',
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar configuracion.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);

    const body = await readJson(request);
    const tenantId = String(body.tenantId || body.id || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);

    const db = requireDb(env);
    const current = await readTenant(db, tenantId);
    if (!current) return jsonResponse({ ok: false, error: 'Cliente no encontrado.' }, 404);

    const currentSettings = safeJson(current.settings_json, {});
    const incomingSettings = body.settings || {};
    // CORREGIDO (mismo fix que business-config.js): con `incoming || current`
    // un campo vaciado a proposito regresaba al valor anterior. Campo
    // presente en el body = usar ese valor aunque sea vacio.
    const has = (key) => Object.prototype.hasOwnProperty.call(incomingSettings, key);
    const normalizedSettings = normalizeTenantSettings(currentSettings, incomingSettings);
    const nextSettings = {
      ...currentSettings,
      ...normalizedSettings,
      timezone: String(incomingSettings.timezone || currentSettings.timezone || 'America/Mexico_City').trim(),
      whatsappNumber: has('whatsappNumber') ? String(incomingSettings.whatsappNumber ?? '').trim() : String(currentSettings.whatsappNumber || '').trim(),
      supportEmail: has('supportEmail') ? String(incomingSettings.supportEmail ?? '').trim() : String(currentSettings.supportEmail || '').trim(),
      paymentMethods: has('paymentMethods')
        ? normalizeSettingList(incomingSettings.paymentMethods, [])
        : normalizeSettingList(currentSettings.paymentMethods, ['Efectivo', 'Transferencia', 'Mercado Pago']),
      fulfillmentTypes: has('fulfillmentTypes')
        ? normalizeSettingList(incomingSettings.fulfillmentTypes, [])
        : normalizeSettingList(currentSettings.fulfillmentTypes, ['Recoger', 'Entrega a domicilio']),
      orderSources: has('orderSources')
        ? normalizeSettingList(incomingSettings.orderSources, [])
        : normalizeSettingList(currentSettings.orderSources, ['Tienda', 'WhatsApp', 'Facebook', 'Instagram', 'Llamada']),
    };

    const tenant = await updateTenant(env, current.id, {
      name: body.name,
      legalName: body.legalName,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      status: body.status,
      plan: body.plan,
      domain: body.domain,
      subdomain: body.subdomain,
      notes: body.notes,
      brand: pickPublicBrand(body.brand || {}),
      settings: nextSettings,
    });

    await writeAudit(env, {
      tenantId: current.id,
      actorRole: 'platform_admin',
      action: 'tenant.config.updated',
      entityType: 'tenant',
      entityId: current.id,
      metadata: { changedBy: 'platform_config_center' },
    });

    return jsonResponse({ ok: true, tenant });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar configuracion.', detail: error.message }, 500);
  }
}
