import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../functions/api/_shared/crm.js';

// Regresion: el CRM borraba clientes con pedidos activos cuando el telefono
// venia con parentesis/puntos, porque la limpieza no coincidia con esta
// normalizacion. Estos casos deben quedar todos en solo digitos.
test('normalizePhone: quita todo lo no numerico', () => {
  assert.equal(normalizePhone('(81) 123-4567'), '811234567');
  assert.equal(normalizePhone('+52 811 392 7548'), '528113927548');
  assert.equal(normalizePhone('81.12.34.56.78'), '8112345678');
  assert.equal(normalizePhone('  8112345678  '), '8112345678');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
});
