import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from '../_shared/tenant.js';
import { requireAuth } from '../_shared/auth.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// MIGRADO a JWT (ver auditoria-saas-multitenant.md, hallazgo #3/#6):
// antes comparaba contra env.ADMIN_PASSWORD, una contraseña global para
// todos los tenants. requireAuth valida el token del usuario, confirma que
// pertenece a ESTE tenant, y confirma el rol.
//
// IMPORTANTE: NO agregar de vuelta un fallback a env.ADMIN_PASSWORD "por
// compatibilidad" â€” esa era la vulnerabilidad crítica #3 (una sola
// contraseña válida para TODOS los tenants del deployment). El frontend
// (AdminPanel.jsx) ya hace login contra /api/auth/login y manda el JWT.
async function checkAuth(request, env) {
  return requireAuth(request, env, ['admin', 'platform_admin']);
}

const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

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

function normalizeBranchId(value, fallback = 'dominio') {
  return String(value || fallback).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: normalizeBranchId(branch.id || branch.name, `sucursal-${index + 1}`),
        name: String(branch.name || branch.id || `Sucursal ${index + 1}`).trim() || `Sucursal ${index + 1}`,
        active: branch.active !== false,
        ordersPassword: String(branch.ordersPassword || branch.orders_password || '').trim(),
        stockPassword: String(branch.stockPassword || branch.stock_password || '').trim(),
        cashierPassword: String(branch.cashierPassword || branch.cashier_password || '').trim(),
        whatsappNumber: String(branch.whatsappNumber || branch.whatsapp_number || branch.whatsapp || '').trim(),
        businessHours: branch.businessHours || branch.business_hours || null,
        soldOut: branch.soldOut || branch.sold_out || {},
      }))
    : DEFAULT_BRANCH_SETTINGS.branches;
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const defaultCashierOrderSource = cashierOrderSources.includes(settings.defaultCashierOrderSource || settings.default_cashier_order_source)
    ? String(settings.defaultCashierOrderSource || settings.default_cashier_order_source).trim()
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, cashierOrderSources, defaultCashierOrderSource, branches };
}

function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
    const parsed = JSON.parse(raw);
    if (parsed.overrides || parsed.extraCategories || parsed.extraProducts || parsed.categoryOrder || parsed.productOrder || parsed.categoryHidden || parsed.promotion || parsed.businessHours || parsed.branchSettings) {
      return {
        overrides: parsed.overrides || {},
        extraCategories: Array.isArray(parsed.extraCategories) ? parsed.extraCategories : [],
        extraProducts: Array.isArray(parsed.extraProducts) ? parsed.extraProducts : [],
        categoryOrder: parsed.categoryOrder || [],
        productOrder: parsed.productOrder || [],
        categoryHidden: parsed.categoryHidden || {},
        promotion: parsed.promotion || null,
        branchPromotions: parsed.branchPromotions || {},
        businessHours: parsed.businessHours || null,
        branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS),
      };
    }
    return { overrides: parsed || {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

function menuPayload(saved, warning = '') {
  return {
    ok: true,
    overrides: saved.overrides,
    extraCategories: saved.extraCategories || [],
    extraProducts: saved.extraProducts || [],
    categoryOrder: saved.categoryOrder,
    productOrder: saved.productOrder,
    categoryHidden: saved.categoryHidden,
    promotion: saved.promotion || null,
    branchPromotions: saved.branchPromotions || {},
    businessHours: saved.businessHours || null,
    branchSettings: normalizeBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
    ...(warning ? { warning } : {}),
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;

    const hasDb = await ensureAppSettings(env);
    if (!hasDb) return jsonResponse(menuPayload(normalizeSavedMenu(''), 'No hay binding DB. Los cambios no se guardaran.'));
    const tenantId = await resolveTenantId(request, env);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);

    const row = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind(settingKey).first();

    return jsonResponse(menuPayload(normalizeSavedMenu(row?.value_json || '')));
  } catch (error) {
    return jsonResponse(menuPayload(normalizeSavedMenu(''), error.message));
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
    const currentRow = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind(settingKey).first();
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

    const valueJson = JSON.stringify({
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
    });
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO app_settings (key, tenant_id, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`
    ).bind(settingKey, tenantId, valueJson, now).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar el menu.', detail: error.message }, 500);
  }
}

