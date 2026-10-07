import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSavedMenu } from '../functions/api/_shared/menuCatalog.js';

test('separa banners legacy de promociones comprables sin perder contenido', () => {
  const saved = normalizeSavedMenu(JSON.stringify({
    promotions: [
      { id: 'portada', active: true, image: '/banner.webp', items: [] },
      { id: 'combo', active: true, price: 199, items: [{ productId: 'panini', quantity: 1 }] },
    ],
  }));
  assert.deepEqual(saved.banners.map((item) => item.id), ['portada']);
  assert.deepEqual(saved.promotions.map((item) => item.id), ['combo']);
});

test('respeta banners y promociones ya separados', () => {
  const saved = normalizeSavedMenu(JSON.stringify({
    banners: [{ id: 'banner-nuevo', items: [] }],
    promotions: [{ id: 'promo-nueva', items: [] }],
  }));
  assert.deepEqual(saved.banners.map((item) => item.id), ['banner-nuevo']);
  assert.deepEqual(saved.promotions.map((item) => item.id), ['promo-nueva']);
});
