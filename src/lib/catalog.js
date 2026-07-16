const categories = [];
const baseProducts = [];

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
  return categories.find((item) => item.id === categoryId) || { label: categoryId, emoji: '🍽️' };
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

// Texto fijo que aparece bajo el titulo de la promo en la pagina del cliente.
// Antes estaba hardcodeado en PublicApp/LegacyApp; ahora es un campo editable
// de la promo con este valor por defecto (vaciarlo lo oculta).
export const DEFAULT_PROMO_DISCLAIMER = 'Esta promoción no permite cambiar ingredientes incluidos.';

export function makeDefaultPromotion(products = CATALOG_PRODUCTS) {
  const firstProduct = products[0] || {};
  return {
    active: false,
    title: 'Promo especial',
    items: firstProduct.id ? [{ productId: firstProduct.id, quantity: 1 }] : [],
    price: 0,
    includedDetails: '',
    disclaimer: DEFAULT_PROMO_DISCLAIMER,
    image: '',
  };
}

// Una opcion de variante dentro de un renglon de promo: un producto elegible
// y cuanto suma al precio de la promo si el cliente lo elige.
function normalizePromoOption(option) {
  const productId = String(option?.productId || option?.product_id || '').trim();
  if (!productId) return null;
  return { productId, extraPrice: Math.max(0, Math.round(Number(option?.extraPrice ?? option?.extra_price ?? 0))) };
}

// Un renglon de promo puede ser:
//  - producto fijo (legacy): { productId, quantity }
//  - grupo de variantes: { quantity, label?, options: [{ productId, extraPrice }] }
// Se normaliza SIEMPRE a la forma de grupo con `options` (el producto fijo es
// un grupo de una sola opcion con extraPrice 0), para que el cliente y el
// editor manejen un solo modelo.
export function normalizePromoItem(item) {
  const quantity = Math.max(1, Number(item?.quantity || 1));
  const label = String(item?.label || '').trim();
  if (Array.isArray(item?.options) && item.options.length > 0) {
    const options = item.options.map(normalizePromoOption).filter(Boolean);
    if (options.length > 0) return { quantity, label, options };
  }
  const productId = String(item?.productId || '').trim();
  return productId ? { quantity, label, options: [{ productId, extraPrice: 0 }] } : null;
}

export function normalizePromotion(promotion, products = CATALOG_PRODUCTS) {
  const base = makeDefaultPromotion(products);
  const legacyItems = promotion?.productId
    ? [{ productId: promotion.productId, quantity: Number(promotion.quantity || 1) }]
    : [];
  const rawItems = Array.isArray(promotion?.items) && promotion.items.length > 0 ? promotion.items : legacyItems;
  const items = rawItems.map(normalizePromoItem).filter(Boolean);

  return {
    ...base,
    ...(promotion || {}),
    active: Boolean(promotion?.active),
    items: items.length ? items : base.items.map(normalizePromoItem).filter(Boolean),
    price: Number(promotion?.price || 0),
  };
}

// Resuelve cada renglon a un grupo con sus opciones expandidas a productos
// reales. `options` = todas las variantes elegibles; `product` = la primera
// (default) para compatibilidad con codigo que lee `.product`.
export function promotionItems(promotion, products = []) {
  if (!promotion || !Array.isArray(promotion.items)) return [];
  const productList = Array.isArray(products) ? products : [];
  const findProduct = (id) => productList.find((productItem) => productItem.id === id);
  return promotion.items
    .map((rawItem) => {
      const item = normalizePromoItem(rawItem);
      if (!item) return null;
      const options = item.options
        .map((option) => {
          const product = findProduct(option.productId);
          return product ? { productId: option.productId, extraPrice: option.extraPrice, product } : null;
        })
        .filter(Boolean);
      if (options.length === 0) return null;
      return {
        quantity: item.quantity,
        label: item.label,
        options,
        hasChoices: options.length > 1,
        product: options[0].product,
        productId: options[0].productId,
      };
    })
    .filter(Boolean);
}


