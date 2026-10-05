import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeliveryAddress, pointsForPurchase } from '../functions/api/_shared/pecasClub.js';

test('Pecas Club acredita una Peca por cada 20 pesos completos', () => {
  assert.equal(pointsForPurchase(0), 0);
  assert.equal(pointsForPurchase(19), 0);
  assert.equal(pointsForPurchase(20), 1);
  assert.equal(pointsForPurchase(145), 7);
  assert.equal(pointsForPurchase(320), 16);
});

test('normaliza domicilios para detectar coincidencias sin depender de formato', () => {
  assert.equal(normalizeDeliveryAddress('Calle Niños Héroes #120, Col. Centro'), 'calleninosheroes120colcentro');
  assert.equal(normalizeDeliveryAddress('  CALLE NINOS HEROES 120 COL CENTRO '), 'calleninosheroes120colcentro');
});
