import { categories, products as baseProducts } from '../data/menu.js';

export const EXTRA_MENU_PRODUCTS = [];

export const CATALOG_PRODUCTS = [
  ...baseProducts,
  ...EXTRA_MENU_PRODUCTS.filter((extra) => !baseProducts.some((product) => product.id === extra.id)),
];

export function slugifyCatalogId(value, fallback = 'item') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

export function mergeCategoriesWithExtras(baseCategories = categories, extraCategories = []) {
  const byId = new Map();
  const order = [];
  [...baseCategories, ...(Array.isArray(extraCategories) ? extraCategories : [])].forEach((category) => {
    const id = slugifyCatalogId(category?.id || category?.label, `categoria-${order.length + 1}`);
    if (!id) return;
    if (!byId.has(id)) order.push(id);
    byId.set(id, {
      id,
      label: String(category?.label || category?.name || id).trim() || id,
      emoji: category?.emoji || '',
      customCategory: Boolean(category?.customCategory),
    });
  });
  return order.map((id) => byId.get(id));
}

export function mergeProductsWithExtras(base = CATALOG_PRODUCTS, extraProducts = []) {
  const byId = new Map();
  const order = [];
  [...base, ...(Array.isArray(extraProducts) ? extraProducts : [])].forEach((product) => {
    const id = slugifyCatalogId(product?.id || product?.name, `producto-${order.length + 1}`);
    if (!id) return;
    if (!byId.has(id)) order.push(id);
    byId.set(id, {
      ...product,
      id,
      name: String(product?.name || id).trim() || id,
      category: slugifyCatalogId(product?.category || 'sin-categoria', 'sin-categoria'),
      price: Number(product?.price || 0),
      customProduct: Boolean(product?.customProduct),
    });
  });
  return order.map((id) => byId.get(id));
}

export function categoryMeta(categoryId) {
  return categories.find((item) => item.id === categoryId) || { label: categoryId, emoji: 'ðŸ½ï¸' };
}

export function sortByOrder(items, order, key = 'id') {
  if (!Array.isArray(order) || order.length === 0) return items;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aRank = rank.has(a[key]) ? rank.get(a[key]) : 9999;
    const bRank = rank.has(b[key]) ? rank.get(b[key]) : 9999;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

export function makeDefaultPromotion(products = CATALOG_PRODUCTS) {
  const firstProduct = products[0] || {};
  return {
    active: false,
    title: 'Promo especial',
    items: firstProduct.id ? [{ productId: firstProduct.id, quantity: 1 }] : [],
    price: 0,
    includedDetails: '',
    image: '',
  };
}

export function normalizePromotion(promotion, products = CATALOG_PRODUCTS) {
  const base = makeDefaultPromotion(products);
  const legacyItems = promotion?.productId
    ? [{ productId: promotion.productId, quantity: Number(promotion.quantity || 1) }]
    : [];
  const items = Array.isArray(promotion?.items) && promotion.items.length > 0
    ? promotion.items.map((item) => ({
        productId: item.productId || '',
        quantity: Math.max(1, Number(item.quantity || 1)),
      })).filter((item) => item.productId)
    : legacyItems;

  return {
    ...base,
    ...(promotion || {}),
    active: Boolean(promotion?.active),
    items: items.length ? items : base.items,
    price: Number(promotion?.price || 0),
  };
}

export function promotionItems(promotion, products) {
  return (promotion.items || [])
    .map((item) => {
      const product = products.find((productItem) => productItem.id === item.productId);
      if (!product) return null;
      return {
        ...item,
        quantity: Math.max(1, Number(item.quantity || 1)),
        product,
      };
    })
    .filter(Boolean);
}

