import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: String(branch.id || branch.name || `sucursal-${index + 1}`).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sucursal-${index + 1}`,
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
  const defaultBranchId = settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId;
  return {
    multiBranchEnabled: Boolean(settings.multiBranchEnabled),
    defaultBranchId,
    branches,
  };
}


function publicBranchSettings(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return {
    ...normalized,
    branches: normalized.branches.map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch),
  };
}

function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS) };
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
    return { overrides: parsed || {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) {
      return jsonResponse({ ok: true, overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS) });
    }

    await ensureTenantColumns(env, ['app_settings']);
    const tenantId = await resolveTenantId(request, env);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    let row = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind(settingKey).first();
    if (!row && settingKey !== 'menu_overrides') {
      row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind('menu_overrides').first();
    }

    const saved = normalizeSavedMenu(row?.value_json || '');

    const publicBranches = publicBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS);
    const cleanedOverrides = { ...(saved.overrides || {}) };
    // Agotado es por sucursal; no enviar soldOut global legacy al cliente.
    for (const productId of Object.keys(cleanedOverrides)) {
      if (cleanedOverrides[productId]?.soldOut !== undefined) {
        const { soldOut: _legacySoldOut, ...rest } = cleanedOverrides[productId] || {};
        if (Object.keys(rest).length) cleanedOverrides[productId] = rest;
        else delete cleanedOverrides[productId];
      }
    }

    return jsonResponse({
      ok: true,
      overrides: cleanedOverrides,
      extraCategories: saved.extraCategories || [],
      extraProducts: saved.extraProducts || [],
      categoryOrder: saved.categoryOrder || [],
      productOrder: saved.productOrder || [],
      categoryHidden: saved.categoryHidden || {},
      promotion: saved.promotion || null,
      branchPromotions: saved.branchPromotions || {},
      businessHours: saved.businessHours || null,
      branchSettings: publicBranches,
    });
  } catch (error) {
    return jsonResponse({ ok: true, overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS), warning: error.message });
  }
}
