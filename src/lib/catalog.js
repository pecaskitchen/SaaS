import { categories, products as baseProducts } from '../data/menu.js';

export const EXTRA_MENU_PRODUCTS = [
  {
    id: 'wrap-pecas',
    name: 'Wrap Pecas',
    category: 'wraps',
    type: 'wrap',
    price: 110,
    badge: 'Nuevo',
    description: 'Lechuga, fajitas de pollo, blue cheese de la casa y mezcla de queso mozzarella y manchego.',
    ingredients: 'Lechuga, fajitas de pollo, blue cheese de la casa, queso mozzarella y queso manchego.',
    defaultSideDressing: 'Blue Cheese',
  },
];

export const CATALOG_PRODUCTS = [
  ...baseProducts,
  ...EXTRA_MENU_PRODUCTS.filter((extra) => !baseProducts.some((product) => product.id === extra.id)),
];

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
