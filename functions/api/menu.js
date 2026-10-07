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
import { UNRESOLVED_TENANT_ID } from './_shared/tenant.js';
import { requireClubAuth } from './_shared/pecasClub.js';

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

const PECAS_DEFAULT_BANNERS = [
  {
    id: 'pecas-club', active: true, isDefault: true, title: '', description: '', disclaimer: '',
    includedDetails: '', items: [], price: 0, image: '/tenants/pecas/products/pecasclub.png',
    linkUrl: '/club/registro', linkLabel: 'Regístrate gratis en Pecas Club',
  },
  {
    id: 'pecas-halloween', active: true, isDefault: false, title: '', description: '', disclaimer: '',
    includedDetails: '', items: [], price: 0, image: '/tenants/pecas/products/pecas_hallo1.png',
    linkUrl: '', linkLabel: '',
  },
];

async function ensurePecasBanners(env, tenantId, settingKey, saved, tenant) {
  if (tenant?.slug !== 'pecas') return saved;
  const markerKey = `${settingKey}:pecas_storefront_optimized_v3`;
  const marker = await env.DB.prepare(`SELECT key FROM app_settings WHERE key = ? LIMIT 1`).bind(markerKey).first();
  if (marker) return saved;
  const currentBranchSettings = saved.branchSettings || DEFAULT_BRANCH_SETTINGS;
  const next = {
    ...saved,
    banners: PECAS_DEFAULT_BANNERS,
    branchSettings: {
      ...currentBranchSettings,
      branches: (currentBranchSettings.branches || []).map((branch) => ({ ...branch, active: true })),
    },
  };
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_settings (key, tenant_id, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET tenant_id = excluded.tenant_id, value_json = excluded.value_json, updated_at = excluded.updated_at`)
      .bind(settingKey, tenantId, JSON.stringify(next), now),
    env.DB.prepare(`INSERT OR IGNORE INTO app_settings (key, tenant_id, value_json, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(markerKey, tenantId, JSON.stringify({ seeded: true }), now),
  ]);
  return next;
}

function publicMenuResponse(request, payload, status = 200) {
  const response = jsonResponse(payload, status);
  if (request.headers.get('authorization')) {
    response.headers.set('Cache-Control', 'private, no-store');
  } else if (status === 200) {
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
  }
  response.headers.append('Vary', 'Authorization');
  return response;
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
    promotions: [],
    banners: [],
    pricingRules: null,
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
  for (const promo of saved.promotions || []) collectPromoProductIds(promo);
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

function publicProduct(product = {}) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    type: product.type || 'custom',
    price: Number(product.price || 0),
    badge: product.badge || '',
    description: product.description || '',
    ingredients: product.ingredients || '',
    image: product.image || '',
    unavailable: Boolean(product.unavailable),
    customProduct: true,
  };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse(blankPublicMenu());

    await ensureTenantColumns(env, ['app_settings']);
    const tenantId = await resolveTenantId(request, env);
    if (tenantId === UNRESOLVED_TENANT_ID) return jsonResponse({ ok: false, error: 'Negocio no disponible.' }, 404);
    const explicitTenant = hasExplicitTenant(request);
    const defaultTenant = defaultTenantId(env);
    if (!explicitTenant && normalizeTenantId(tenantId, env) === defaultTenant) {
      return jsonResponse(blankPublicMenu(publicTenantConfig(null)));
    }

    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    const [row, tenantRow] = await Promise.all([
      env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first(),
      env.DB.prepare(`SELECT id, slug, name, brand_json, settings_json FROM saas_tenants WHERE id = ? OR slug = ?`).bind(tenantId, tenantId).first().catch(() => null),
    ]);
    let saved = normalizeSavedMenu(row?.value_json || '');
    const tenant = tenantRow ? publicTenantConfig(tenantRow) : publicTenantConfig({ id: tenantId, slug: tenantId, name: tenantId, brand_json: '{}', settings_json: '{}' });
    saved = await ensurePecasBanners(env, tenantId, settingKey, saved, tenant);
    const effectivePromise = readEffectiveCatalog(env, tenantId, { ...saved, overrides: cleanPublicOverrides(saved.overrides || {}) }, { overrides: cleanPublicOverrides(saved.overrides || {}) });
    const linkedClubPromotions = await env.DB.prepare(`SELECT store_promotion_id FROM club_promotions WHERE tenant_id = ? AND active = 1 AND store_promotion_id IS NOT NULL AND store_promotion_id != ''`).bind(tenantId).all().then((result) => new Set((result.results || []).map((item) => item.store_promotion_id))).catch(() => new Set());
    for (const item of saved.promotions || []) if (item?.clubOnly && item?.id) linkedClubPromotions.add(item.id);
    let clubAuthenticated = false;
    if (linkedClubPromotions.size) {
      const clubAuth = request.headers.get('authorization') ? await requireClubAuth(request, env) : { ok: false };
      clubAuthenticated = Boolean(clubAuth.ok);
    }

    const cleanedOverrides = cleanPublicOverrides(saved.overrides || {});
    const effective = await effectivePromise;
    const baseExtraProducts = Array.isArray(effective.extraProducts) ? effective.extraProducts : [];
    const baseExtraCategories = Array.isArray(effective.extraCategories) ? effective.extraCategories : [];
    const { legacyPromoProducts, legacyPromoCategories } = promoFallbackProducts(saved, cleanedOverrides, baseExtraProducts, baseExtraCategories);

    return publicMenuResponse(request, {
      ok: true,
      overrides: cleanedOverrides,
      extraCategories: [...baseExtraCategories, ...legacyPromoCategories],
      extraProducts: [...baseExtraProducts, ...legacyPromoProducts].map(publicProduct),
      categoryOrder: effective.categoryOrder || [],
      productOrder: effective.productOrder || [],
      categoryHidden: effective.categoryHidden || {},
      promotion: saved.promotions?.[0] || null,
      promotions: (saved.promotions || (saved.promotion ? [saved.promotion] : [])).map((item) => ({ ...item, clubOnly: linkedClubPromotions.has(item?.id), clubAccess: !linkedClubPromotions.has(item?.id) || clubAuthenticated })),
      banners: saved.banners || [],
      pricingRules: saved.pricingRules || null,
      branchPromotions: saved.branchPromotions || {},
      businessHours: saved.businessHours || null,
      branchSettings: publicBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS),
      baseCatalogEnabled: false,
      catalogSource: effective.catalogSource || 'legacy',
      tenant,
    });
  } catch (error) {
    return publicMenuResponse(request, blankPublicMenu(publicTenantConfig(null), error.message), 500);
  }
}
