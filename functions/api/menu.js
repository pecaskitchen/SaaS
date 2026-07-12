import { defaultTenantId, ensureTenantColumns, normalizeTenantId, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  cleanPublicOverrides,
  emptySavedMenu,
  jsonResponse,
  normalizeSavedMenu,
  publicBranchSettings,
  readEffectiveCatalog,
  safeJson,
} from './_shared/menuCatalog.js';

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
    catalogSource: 'blank',
    tenant,
    ...(warning ? { warning } : {}),
  };
}

function promoFallbackProducts(saved, cleanedOverrides, products, categories) {
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

  const existingProductIds = new Set(products.map((product) => product.id));
  const legacyPromoProducts = products.length ? [] : [...promoProductIds]
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
  const legacyPromoCategories = legacyPromoProducts.length && categories.length === 0
    ? [{ id: legacyPromoProducts[0].category, label: legacyPromoProducts[0].category, emoji: '', customCategory: true }]
    : [];
  return { legacyPromoProducts, legacyPromoCategories };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse(blankPublicMenu());

    await ensureTenantColumns(env, ['app_settings']);
    const tenantId = await resolveTenantId(request, env);
    const explicitTenant = hasExplicitTenant(request);
    const defaultTenant = defaultTenantId(env);
    if (!explicitTenant && normalizeTenantId(tenantId, env) === defaultTenant) {
      return jsonResponse(blankPublicMenu(publicTenantConfig(null)));
    }

    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
    const saved = normalizeSavedMenu(row?.value_json || '');

    const tenantRow = await env.DB.prepare(`SELECT id, slug, name, brand_json, settings_json FROM saas_tenants WHERE id = ? OR slug = ?`)
      .bind(tenantId, tenantId)
      .first()
      .catch(() => null);
    const tenant = tenantRow ? publicTenantConfig(tenantRow) : publicTenantConfig({ id: tenantId, slug: tenantId, name: tenantId, brand_json: '{}', settings_json: '{}' });

    const cleanedOverrides = cleanPublicOverrides(saved.overrides || {});
    const effective = await readEffectiveCatalog(env, tenantId, { ...saved, overrides: cleanedOverrides }, { overrides: cleanedOverrides });
    const baseExtraProducts = Array.isArray(effective.extraProducts) ? effective.extraProducts : [];
    const baseExtraCategories = Array.isArray(effective.extraCategories) ? effective.extraCategories : [];
    const { legacyPromoProducts, legacyPromoCategories } = promoFallbackProducts(saved, cleanedOverrides, baseExtraProducts, baseExtraCategories);

    return jsonResponse({
      ok: true,
      overrides: cleanedOverrides,
      extraCategories: [...baseExtraCategories, ...legacyPromoCategories],
      extraProducts: [...baseExtraProducts, ...legacyPromoProducts],
      categoryOrder: effective.categoryOrder || [],
      productOrder: effective.productOrder || [],
      categoryHidden: effective.categoryHidden || {},
      promotion: saved.promotion || null,
      branchPromotions: saved.branchPromotions || {},
      businessHours: saved.businessHours || null,
      branchSettings: publicBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
      baseCatalogEnabled: false,
      catalogSource: effective.catalogSource || 'legacy',
      tenant,
    });
  } catch (error) {
    return jsonResponse(blankPublicMenu(publicTenantConfig(null), error.message));
  }
}
