import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePromoItem, normalizePromotion, promotionItems } from '../src/lib/catalog.js';

const PRODUCTS = [
  { id: 'chapata-pollo', name: 'Chapata Pollo', price: 80, category: 'chapatas' },
  { id: 'chapata-premium', name: 'Chapata Premium', price: 100, category: 'chapatas' },
  { id: 'coca', name: 'Coca', price: 25, category: 'bebidas' },
  { id: 'sprite', name: 'Sprite', price: 25, category: 'bebidas' },
];

test('normalizePromoItem: producto fijo legacy se vuelve grupo de una opcion', () => {
  const item = normalizePromoItem({ productId: 'coca', quantity: 2 });
  assert.deepEqual(item, { quantity: 2, label: '', options: [{ productId: 'coca', extraPrice: 0 }] });
});

test('normalizePromoItem: grupo de variantes conserva costo extra y quita opciones sin producto', () => {
  const item = normalizePromoItem({
    quantity: 1,
    label: 'Elige tu chapata',
    options: [{ productId: 'chapata-pollo', extraPrice: 0 }, { productId: '', extraPrice: 5 }, { productId: 'chapata-premium', extraPrice: 20 }],
  });
  assert.equal(item.label, 'Elige tu chapata');
  assert.deepEqual(item.options, [{ productId: 'chapata-pollo', extraPrice: 0 }, { productId: 'chapata-premium', extraPrice: 20 }]);
});

test('normalizePromoItem: extra negativo se recorta a 0 y se redondea', () => {
  const item = normalizePromoItem({ options: [{ productId: 'coca', extraPrice: -10 }, { productId: 'sprite', extraPrice: 12.6 }] });
  assert.equal(item.options[0].extraPrice, 0);
  assert.equal(item.options[1].extraPrice, 13);
});

test('promotionItems: resuelve opciones a productos y marca hasChoices', () => {
  const promo = normalizePromotion({
    active: true,
    price: 100,
    items: [
      { quantity: 1, label: 'Chapata', options: [{ productId: 'chapata-pollo', extraPrice: 0 }, { productId: 'chapata-premium', extraPrice: 20 }] },
      { productId: 'coca', quantity: 1 },
    ],
  }, PRODUCTS);
  const groups = promotionItems(promo, PRODUCTS);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].hasChoices, true);
  assert.equal(groups[0].options[1].product.name, 'Chapata Premium');
  assert.equal(groups[0].options[1].extraPrice, 20);
  assert.equal(groups[1].hasChoices, false); // producto fijo
});

test('promotionItems: descarta opciones cuyo producto no existe en el catalogo', () => {
  const promo = normalizePromotion({
    active: true,
    price: 50,
    items: [{ options: [{ productId: 'fantasma', extraPrice: 0 }, { productId: 'coca', extraPrice: 0 }] }],
  }, PRODUCTS);
  const groups = promotionItems(promo, PRODUCTS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].options.length, 1);
  assert.equal(groups[0].options[0].productId, 'coca');
});

test('precio de promo con variante premium = base + extra', () => {
  const promo = normalizePromotion({
    active: true, price: 100,
    items: [{ options: [{ productId: 'chapata-pollo', extraPrice: 0 }, { productId: 'chapata-premium', extraPrice: 20 }] }],
  }, PRODUCTS);
  const groups = promotionItems(promo, PRODUCTS);
  const premium = groups[0].options.find((o) => o.productId === 'chapata-premium');
  assert.equal(promo.price + premium.extraPrice, 120);
});
