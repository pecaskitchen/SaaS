import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from '../_shared/tenant.js';
import { requireAuth } from '../_shared/auth.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// MIGRADO a JWT (ver auditoria-saas-multitenant.md, hallazgo #3/#6).
async function checkSuperAuth(request, env) {
  const jwt = await requireAuth(request, env, ['admin', 'super', 'platform_admin']);
  if (jwt.ok) return jwt;
  const password = request.headers.get('x-super-password') || request.headers.get('x-admin-password') || '';
  if ((env.SUPER_PASSWORD && password === env.SUPER_PASSWORD) || (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD)) {
    return { ok: true, session: { role: env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD ? 'admin' : 'super', legacy: true } };
  }
  return jwt;
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
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
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, branches };
}

function sanitizeBranchSettingsForSuper(settings = {}) {
  const normalized = normalizeBranchSettings(settings);
  return {
    multiBranchEnabled: normalized.multiBranchEnabled,
    defaultBranchId: normalized.defaultBranchId,
    branches: normalized.branches
      .filter((branch) => branch.active !== false)
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        active: true,
        whatsappNumber: branch.whatsappNumber || '',
        businessHours: branch.businessHours || null,
      })),
  };
}

function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { overrides: {}, categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
    const parsed = JSON.parse(raw);
    if (parsed.overrides || parsed.categoryOrder || parsed.productOrder || parsed.categoryHidden || parsed.promotion || parsed.businessHours || parsed.branchSettings) {
      return {
        overrides: parsed.overrides || {},
        categoryOrder: parsed.categoryOrder || [],
        productOrder: parsed.productOrder || [],
        categoryHidden: parsed.categoryHidden || {},
        promotion: parsed.promotion || null,
        branchPromotions: parsed.branchPromotions || {},
        businessHours: parsed.businessHours || null,
        branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS),
      };
    }
    return { overrides: parsed || {}, categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { overrides: {}, categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

function superPayload(saved, warning = '') {
  return {
    ok: true,
    promotion: saved.promotion || null,
    branchPromotions: saved.branchPromotions || {},
    businessHours: saved.businessHours || null,
    branchSettings: sanitizeBranchSettingsForSuper(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
    ...(warning ? { warning } : {}),
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await checkSuperAuth(request, env);
    if (!auth.ok) return auth.response;

    const hasDb = await ensureAppSettings(env);
    if (!hasDb) return jsonResponse(superPayload(normalizeSavedMenu(''), 'No hay binding DB. Los cambios no se guardaran.'));

    // CORREGIDO: antes leía siempre la key global 'menu_overrides', mezclando
    // promociones/horarios de TODOS los tenants. Ahora usa la misma clave
    // namespaced por tenant que admin/menu.js.
    const tenantId = await resolveTenantId(request, env);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    const row = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind(settingKey).first();

    return jsonResponse(superPayload(normalizeSavedMenu(row?.value_json || '')));
  } catch (error) {
    return jsonResponse(superPayload(normalizeSavedMenu(''), error.message));
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await checkSuperAuth(request, env);
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
    const currentBranchSettings = normalizeBranchSettings(current.branchSettings || DEFAULT_BRANCH_SETTINGS);
    const incomingBranchSettings = normalizeBranchSettings(body.branchSettings || {});
    const incomingBranchesById = new Map((incomingBranchSettings.branches || []).map((branch) => [branch.id, branch]));

    const mergedBranchSettings = {
      ...currentBranchSettings,
      branches: currentBranchSettings.branches.map((branch) => {
        const incoming = incomingBranchesById.get(branch.id);
        if (!incoming || branch.active === false) return branch;
        return {
          ...branch,
          businessHours: incoming.businessHours || branch.businessHours || null,
        };
      }),
    };

    const activeIds = new Set(currentBranchSettings.branches.filter((branch) => branch.active !== false).map((branch) => branch.id));
    const incomingPromos = body.branchPromotions || {};
    const mergedBranchPromotions = { ...(current.branchPromotions || {}) };
    for (const [branchId, promo] of Object.entries(incomingPromos)) {
      if (activeIds.has(normalizeBranchId(branchId, branchId))) {
        mergedBranchPromotions[normalizeBranchId(branchId, branchId)] = promo || null;
      }
    }

    const valueJson = JSON.stringify({
      overrides: current.overrides || {},
      categoryOrder: current.categoryOrder || [],
      productOrder: current.productOrder || [],
      categoryHidden: current.categoryHidden || {},
      promotion: current.promotion || null,
      branchPromotions: mergedBranchPromotions,
      businessHours: current.businessHours || null,
      branchSettings: normalizeBranchSettings(mergedBranchSettings),
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
    return jsonResponse({ ok: false, error: 'No se pudo guardar Super usuario.', detail: error.message }, 500);
  }
}
