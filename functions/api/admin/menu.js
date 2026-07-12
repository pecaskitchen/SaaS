import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from '../_shared/tenant.js';
import { requireAuth } from '../_shared/auth.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  emptySavedMenu,
  jsonResponse,
  normalizeBranchSettings,
  normalizeSavedMenu,
  readEffectiveCatalog,
  saveCatalogTables,
} from '../_shared/menuCatalog.js';

async function checkAuth(request, env) {
  return requireAuth(request, env, ['admin', 'platform_admin']);
}

async function ensureAppSettings(env) {
  if (!env.DB) return false;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await ensureTenantColumns(env, ['app_settings']);
  return true;
}

function menuPayload(saved, warning = '') {
  return {
    ok: true,
    overrides: saved.overrides || {},
    extraCategories: saved.extraCategories || [],
    extraProducts: saved.extraProducts || [],
    categoryOrder: saved.categoryOrder || [],
    productOrder: saved.productOrder || [],
    categoryHidden: saved.categoryHidden || {},
    promotion: saved.promotion || null,
    branchPromotions: saved.branchPromotions || {},
    businessHours: saved.businessHours || null,
    branchSettings: normalizeBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
    catalogSource: saved.catalogSource || 'legacy',
    ...(warning ? { warning } : {}),
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;

    const hasDb = await ensureAppSettings(env);
    if (!hasDb) return jsonResponse(menuPayload(emptySavedMenu(), 'No hay binding DB. Los cambios no se guardaran.'));
    const tenantId = await resolveTenantId(request, env);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);

    const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
    const saved = normalizeSavedMenu(row?.value_json || '');
    const effective = await readEffectiveCatalog(env, tenantId, saved);
    return jsonResponse(menuPayload(effective));
  } catch (error) {
    return jsonResponse(menuPayload(emptySavedMenu(), error.message));
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;
    const hasDb = await ensureAppSettings(env);
    if (!hasDb) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const tenantId = await resolveTenantId(request, env);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);

    const body = await request.json();
    const currentRow = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
    const current = normalizeSavedMenu(currentRow?.value_json || '');
    const hasOverrides = Object.prototype.hasOwnProperty.call(body, 'overrides');
    const incomingOverrides = hasOverrides ? (body.overrides || {}) : (current.overrides || {});
    const mergedOverrides = { ...incomingOverrides };

    for (const [productId, savedOverride] of Object.entries(current.overrides || {})) {
      if (!hasOverrides && savedOverride) mergedOverrides[productId] = savedOverride;
      if (hasOverrides && savedOverride?.soldOut !== undefined) {
        mergedOverrides[productId] = {
          ...(mergedOverrides[productId] || {}),
          soldOut: Boolean(savedOverride.soldOut),
        };
      }
    }

    const nextMenu = {
      overrides: mergedOverrides,
      extraCategories: Object.prototype.hasOwnProperty.call(body, 'extraCategories') ? (Array.isArray(body.extraCategories) ? body.extraCategories : []) : (current.extraCategories || []),
      extraProducts: Object.prototype.hasOwnProperty.call(body, 'extraProducts') ? (Array.isArray(body.extraProducts) ? body.extraProducts : []) : (current.extraProducts || []),
      categoryOrder: Object.prototype.hasOwnProperty.call(body, 'categoryOrder') ? (body.categoryOrder || []) : (current.categoryOrder || []),
      productOrder: Object.prototype.hasOwnProperty.call(body, 'productOrder') ? (body.productOrder || []) : (current.productOrder || []),
      categoryHidden: Object.prototype.hasOwnProperty.call(body, 'categoryHidden') ? (body.categoryHidden || {}) : (current.categoryHidden || {}),
      promotion: Object.prototype.hasOwnProperty.call(body, 'promotion') ? (body.promotion || null) : (current.promotion || null),
      branchPromotions: Object.prototype.hasOwnProperty.call(body, 'branchPromotions') ? (body.branchPromotions || {}) : (current.branchPromotions || {}),
      businessHours: Object.prototype.hasOwnProperty.call(body, 'businessHours') ? (body.businessHours || null) : (current.businessHours || null),
      branchSettings: normalizeBranchSettings(Object.prototype.hasOwnProperty.call(body, 'branchSettings') ? (body.branchSettings || DEFAULT_BRANCH_SETTINGS) : (current.branchSettings || DEFAULT_BRANCH_SETTINGS)),
      baseCatalogEnabled: false,
    };

    const catalogResult = await saveCatalogTables(env, tenantId, nextMenu);
    const valueJson = JSON.stringify(nextMenu);
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO app_settings (key, tenant_id, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`
    ).bind(settingKey, tenantId, valueJson, now).run();

    return jsonResponse({ ok: true, catalogSource: 'tables', mojibakeWarnings: catalogResult.mojibakeWarnings || [] });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.validationErrors ? 'El catalogo tiene errores.' : 'No se pudo guardar el menu.', detail: error.message, validationErrors: error.validationErrors || [] }, error.validationErrors ? 400 : 500);
  }
}
