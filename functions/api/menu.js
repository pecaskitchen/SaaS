import { defaultTenantId, ensureTenantColumns, normalizeTenantId, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';

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

const DEFAULT_PUBLIC_BRAND = {
  displayName: 'Tu negocio',
  tagline: '',
  logoUrl: '',
  heroEyebrow: 'Pedidos en linea',
  heroTitle: 'Catalogo en preparacion',
  heroText: 'Este negocio todavia no tiene productos publicados.',
  primaryActionLabel: 'Ver catalogo',
  secondaryActionLabel: 'Ver carrito',
  orderMessageIntro: 'Hola, quiero hacer un pedido:',
  menuEyebrow: 'Menu',
  menuTitle: 'Elige una categoria',
  emptyCatalogTitle: 'Catalogo en preparacion',
  emptyCatalogText: 'Este negocio todavia no tiene productos publicados.',
  primaryColor: '#111827',
  accentColor: '#ef4444',
};

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function publicTenantConfig(row) {
  const brand = { ...DEFAULT_PUBLIC_BRAND, ...(row ? safeJson(row.brand_json, {}) : {}) };
  const displayName = String(brand.displayName || row?.name || DEFAULT_PUBLIC_BRAND.displayName).trim();
  return {
    id: row?.id || 'default',
    slug: row?.slug || 'default',
    name: row?.name || displayName,
    brand: {
      ...brand,
      displayName,
      heroTitle: String(brand.heroTitle || displayName || DEFAULT_PUBLIC_BRAND.heroTitle).trim(),
      orderMessageIntro: String(brand.orderMessageIntro || `Hola ${displayName}, quiero hacer un pedido:`).trim(),
    },
    settings: row ? safeJson(row.settings_json, {}) : {},
  };
}

function hasExplicitTenant(request) {
  try {
    return Boolean(new URL(request.url).searchParams.get('tenant_id') || request.headers.get('x-tenant-id'));
  } catch {
    return false;
  }
}

function blankPublicMenu(tenant = publicTenantConfig(null), warning = '') {
  return {
    ok: true,
    overrides: {},
    extraCategories: [],
    extraProducts: [],
    categoryOrder: [],
    productOrder: [],
    categoryHidden: {},
    promotion: null,
    branchPromotions: {},
    businessHours: null,
    branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS),
    baseCatalogEnabled: false,
    tenant,
    ...(warning ? { warning } : {}),
  };
}
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
    if (!raw) return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS), baseCatalogEnabled: false };
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
        baseCatalogEnabled: Boolean(parsed.baseCatalogEnabled),
      };
    }
    return { overrides: parsed || {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS), baseCatalogEnabled: false };
  } catch {
    return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, branchPromotions: {}, businessHours: null, branchSettings: publicBranchSettings(DEFAULT_BRANCH_SETTINGS), baseCatalogEnabled: false };
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) {
      return jsonResponse(blankPublicMenu());
    }

    await ensureTenantColumns(env, ['app_settings']);
    const tenantId = await resolveTenantId(request, env);
    const explicitTenant = hasExplicitTenant(request);
    const defaultTenant = defaultTenantId(env);
    if (!explicitTenant && normalizeTenantId(tenantId, env) === defaultTenant) {
      return jsonResponse(blankPublicMenu(publicTenantConfig(null)));
    }

    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    const row = await env.DB.prepare(
      `SELECT value_json FROM app_settings WHERE key = ?`
    ).bind(settingKey).first();

    const saved = normalizeSavedMenu(row?.value_json || '');
    const tenantRow = await env.DB.prepare(`SELECT id, slug, name, brand_json, settings_json FROM saas_tenants WHERE id = ? OR slug = ?`).bind(tenantId, tenantId).first().catch(() => null);
    const tenant = tenantRow ? publicTenantConfig(tenantRow) : publicTenantConfig({ id: tenantId, slug: tenantId, name: tenantId, brand_json: '{}', settings_json: '{}' });

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
      baseCatalogEnabled: false,
      tenant,
    });
  } catch (error) {
    return jsonResponse(blankPublicMenu(publicTenantConfig(null), error.message));
  }
}



