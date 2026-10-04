import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogDiagnostics, estimateRecipeCost, itemUnitCost } from '../src/lib/recipeSetup.js';

test('calcula costo por unidad y receta', () => {
  const items = [{ id: 1, name: 'Queso', purchase_price: 180, purchase_unit_quantity: 1000 }];
  assert.equal(itemUnitCost(items[0]), 0.18);
  assert.deepEqual(estimateRecipeCost([{ item_id: 1, quantity: 35 }], items), { cost: 6.3, unknown: [] });
});

test('reporta costos desconocidos sin inventar ceros', () => {
  const result = estimateRecipeCost([{ item_id: 2, item_name: 'Salsa', quantity: 20 }], []);
  assert.equal(result.cost, 0);
  assert.deepEqual(result.unknown, ['Salsa']);
});

test('calcula preparaciones anidadas por rendimiento', () => {
  const items = [
    { id: 1, name: 'Mayonesa', purchase_price: 100, purchase_unit_quantity: 1000 },
    { id: 2, name: 'Aderezo', item_type: 'Sub-receta / preparado', purchase_price: 0, purchase_unit_quantity: 0 },
  ];
  const recipes = [{ id: 8, recipe_type: 'subrecipe', output_item_id: 2, output_quantity: 500, lines: [{ item_id: 1, quantity: 400 }] }];
  const result = estimateRecipeCost([{ item_id: 2, quantity: 50 }], items, recipes);
  assert.deepEqual(result, { cost: 4, unknown: [] });
});

test('diagnostica duplicados, recetas vacias y preparaciones sin rendimiento', () => {
  const issues = catalogDiagnostics({
    items: [
      { id: 1, name: 'Queso', unit_code: 'g', purchase_price: 100, purchase_unit_quantity: 1000 },
      { id: 2, name: ' queso ', unit_code: 'g', purchase_price: 90, purchase_unit_quantity: 1000 },
    ],
    recipes: [{ name: 'Salsa', recipe_type: 'subrecipe', output_quantity: 0, lines: [] }],
    products: [],
  });
  assert.ok(issues.some((issue) => issue.type === 'duplicate'));
  assert.ok(issues.some((issue) => issue.type === 'empty-recipe'));
  assert.ok(issues.some((issue) => issue.type === 'missing-yield'));
});
