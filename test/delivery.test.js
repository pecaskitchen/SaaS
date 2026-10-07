import test from 'node:test';
import assert from 'node:assert/strict';
import { pecasDeliveryFee } from '../apps/omdexa/src/lib/delivery.js';

test('Pecas no cobra envío a la colonia Adara', () => {
  assert.equal(pecasDeliveryFee({ fulfillmentType: 'Entrega a domicilio', neighborhood: ' Adara ', subtotal: 100 }), 0);
});

test('Pecas cobra $15 de envío a otras colonias debajo de $250', () => {
  assert.equal(pecasDeliveryFee({ fulfillmentType: 'Entrega a domicilio', neighborhood: 'Centro', subtotal: 249 }), 15);
});

test('Pecas ofrece envío gratis desde $250 y al recoger', () => {
  assert.equal(pecasDeliveryFee({ fulfillmentType: 'Entrega a domicilio', neighborhood: 'Centro', subtotal: 250 }), 0);
  assert.equal(pecasDeliveryFee({ fulfillmentType: 'Recoger', neighborhood: 'Centro', subtotal: 100 }), 0);
});
