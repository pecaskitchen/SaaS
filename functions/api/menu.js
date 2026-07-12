import { defaultTenantId, ensureTenantColumns, normalizeTenantId, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const defaultCashierOrderSource = cashierOrderSources.includes(settings.defaultCashierOrderSource || settings.default_cashier_order_source)
    ? String(settings.defaultCashierOrderSource || settings.default_cashier_order_source).trim()
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return {
    multiBranchEnabled: Boolean(settings.multiBranchEnabled),
    defaultBranchId,
    cashierOrderSources,
    defaultCashierOrderSource,
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

    const promoProductIds = new Set();
    const collectPromoProductIds = (promo) => {
      if (!promo?.active || !Array.isArray(promo.items)) return;
      for (const item of promo.items) {
        const productId = String(item?.productId || '').trim();
        if (productId) promoProductIds.add(productId);
      }
    };
    collectPromoProductIds(saved.promotion);
    for (const promo of Object.values(saved.branchPromotions || {})) collectPromoProductIds(promo);
    const baseExtraProducts = Array.isArray(saved.extraProducts) ? saved.extraProducts : [];
    const existingProductIds = new Set(baseExtraProducts.map((product) => product.id));
    const legacyPromoProducts = baseExtraProducts.length ? [] : [...promoProductIds]
      .filter((productId) => cleanedOverrides[productId] && !existingProductIds.has(productId))
      .map((productId) => ({
        id: productId,
        name: cleanedOverrides[productId].name || productId,
        category: (saved.categoryOrder || [])[0] || 'promociones',
        type: 'custom',
        price: Number(cleanedOverrides[productId].price || 0),
        badge: '',
        description: cleanedOverrides[productId].description || '',
        ingredients: cleanedOverrides[productId].ingredients || '',
        image: cleanedOverrides[productId].image || '',
        unavailable: Boolean(cleanedOverrides[productId].unavailable),
        customProduct: true,
      }));
    const baseExtraCategories = Array.isArray(saved.extraCategories) ? saved.extraCategories : [];
    const legacyPromoCategories = legacyPromoProducts.length && baseExtraCategories.length === 0
      ? [{ id: legacyPromoProducts[0].category, label: legacyPromoProducts[0].category, emoji: '', customCategory: true }]
      : [];

    return jsonResponse({
      ok: true,
      overrides: cleanedOverrides,
      extraCategories: [...baseExtraCategories, ...legacyPromoCategories],
      extraProducts: [...baseExtraProducts, ...legacyPromoProducts],
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





