function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isAuthorized(request, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  const providedPassword = request.headers.get('x-admin-password');
  return Boolean(providedPassword && adminPassword && providedPassword === adminPassword);
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

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

export async function onRequestGet({ request, env }) {
  try {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ ok: false, error: 'No autorizado.' }, 401);
    }

    const row = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind('menu_overrides').first();

    const saved = normalizeSavedMenu(row?.value_json || '');

    return jsonResponse({
      ok: true,
      overrides: saved.overrides,
      categoryOrder: saved.categoryOrder,
      productOrder: saved.productOrder,
      categoryHidden: saved.categoryHidden,
      promotion: saved.promotion || null,
      branchPromotions: saved.branchPromotions || {},
      businessHours: saved.businessHours || null,
      branchSettings: normalizeBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo leer el menú.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!isAuthorized(request, env)) {
      return jsonResponse({ ok: false, error: 'No autorizado.' }, 401);
    }

    const body = await request.json();
    const currentRow = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind('menu_overrides').first();
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
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    ).bind('menu_overrides', valueJson, now).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar el menú.', detail: error.message }, 500);
  }
}
