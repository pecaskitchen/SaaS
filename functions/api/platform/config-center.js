import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { ensurePlatformTables, safeJson, updateTenant } from '../_shared/platform.js';
import { writeAudit } from '../_shared/audit.js';

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
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    await ensurePlatformTables(env);

    const tenantId = String(new URL(request.url).searchParams.get('tenant_id') || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenant_id.' }, 400);

    const db = requireDb(env);
    const tenant = await readTenant(db, tenantId);
    if (!tenant) return jsonResponse({ ok: false, error: 'Cliente no encontrado.' }, 404);

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
        settings: safeJson(tenant.settings_json, {}),
        notes: tenant.notes || '',
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar configuracion.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
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
    const nextSettings = {
      ...currentSettings,
      timezone: String(incomingSettings.timezone || currentSettings.timezone || 'America/Mexico_City').trim(),
      whatsappNumber: String(incomingSettings.whatsappNumber || currentSettings.whatsappNumber || '').trim(),
      supportEmail: String(incomingSettings.supportEmail || currentSettings.supportEmail || '').trim(),
      paymentMethods: normalizeSettingList(incomingSettings.paymentMethods, currentSettings.paymentMethods || ['Efectivo', 'Transferencia', 'Mercado Pago']),
      fulfillmentTypes: normalizeSettingList(incomingSettings.fulfillmentTypes, currentSettings.fulfillmentTypes || ['Recoger', 'Entrega a domicilio']),
      orderSources: normalizeSettingList(incomingSettings.orderSources, currentSettings.orderSources || ['Tienda', 'WhatsApp', 'Facebook', 'Instagram', 'Llamada']),
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

