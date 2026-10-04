import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODULES_BY_BUSINESS_TYPE, normalizeBusinessType, normalizeModuleSettings } from '../shared/modules.js';

test('cada giro declara historial y modulos operativos completos', () => {
  for (const [type, modules] of Object.entries(DEFAULT_MODULES_BY_BUSINESS_TYPE)) {
    assert.equal(modules.historial, true, `${type} debe declarar historial`);
    assert.equal(modules.inicio, true);
    assert.equal(modules.usuarios, true);
  }
});

test('floreria no hereda recetas gastronomicas', () => {
  const modules = normalizeModuleSettings({}, 'floral');
  assert.equal(modules.pedidos, true);
  assert.equal(modules.menu, true);
  assert.equal(modules.recetas, false);
});

test('un giro desconocido cae de forma segura a food', () => {
  assert.equal(normalizeBusinessType('desconocido'), 'food');
});
