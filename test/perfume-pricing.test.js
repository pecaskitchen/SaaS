import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePerfumePricing, DEFAULT_PERFUME_PRICING_RULES } from '../src/lib/perfumePricing.js';

const item = (variantId, quantity, basePrice, addOnPrice = 0) => ({
  variantId, quantity, basePrice, addOnPrice, unitPrice: basePrice + addOnPrice,
});

test('combina perfumes distintos de 30 ml para aplicar 2x120', () => {
  const result = calculatePerfumePricing([item('30-ml', 1, 70), item('30-ml', 1, 70)], DEFAULT_PERFUME_PRICING_RULES);
  assert.equal(result.subtotal, 120);
  assert.equal(result.discount, 20);
});

test('aplica el mejor precio por volumen y cobra feromonas aparte', () => {
  const result = calculatePerfumePricing([item('30-ml', 20, 70, 10)], DEFAULT_PERFUME_PRICING_RULES);
  assert.equal(result.subtotal, 1200);
  assert.equal(result.appliedRules[0].label, 'Desde 20 piezas: $50 c/u');
});

test('aplica escalas independientes por presentacion', () => {
  const result = calculatePerfumePricing([item('30-ml', 10, 70), item('60-ml', 10, 120)], DEFAULT_PERFUME_PRICING_RULES);
  assert.equal(result.subtotal, 1650);
  assert.equal(result.appliedRules.length, 2);
});
