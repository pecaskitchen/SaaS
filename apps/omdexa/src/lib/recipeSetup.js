export const OPTION_TEMPLATES = [
  {
    id: 'sizes',
    name: 'Tamaños',
    description: 'El cliente elige un tamaño.',
    options: ['Chico', 'Mediano', 'Grande'],
    maxTotal: 1,
    required: true,
  },
  {
    id: 'milk',
    name: 'Tipo de leche',
    description: 'Leches disponibles para bebidas.',
    options: ['Entera', 'Deslactosada', 'Vegetal'],
    maxTotal: 1,
    required: true,
  },
  {
    id: 'flavors',
    name: 'Sabores',
    description: 'Sabores o jarabes que puede agregar el cliente.',
    options: ['Vainilla', 'Caramelo', 'Avellana'],
    maxTotal: 3,
    required: false,
  },
  {
    id: 'extras',
    name: 'Extras',
    description: 'Complementos con precio adicional.',
    options: ['Extra 1', 'Extra 2', 'Extra 3'],
    maxTotal: 5,
    required: false,
  },
];

export function itemUnitCost(item) {
  const quantity = Number(item?.purchase_unit_quantity || 0);
  const price = Number(item?.purchase_price || 0);
  if (!(quantity > 0) || price < 0) return null;
  return price / quantity;
}

export function estimateRecipeCost(lines = [], items = [], recipes = [], visited = new Set()) {
  const byId = new Map(items.map((item) => [Number(item.id), item]));
  let cost = 0;
  const unknown = [];
  for (const line of lines) {
    const item = byId.get(Number(line.item_id));
    let unitCost = itemUnitCost(item);
    if (unitCost === null && item && (item.item_type === 'Sub-receta / preparado' || item.type === 'subrecipe')) {
      const preparation = recipes.find((recipe) => recipe.recipe_type === 'subrecipe' && Number(recipe.output_item_id) === Number(item.id));
      if (preparation && !visited.has(Number(preparation.id)) && Number(preparation.output_quantity || 0) > 0) {
        const nextVisited = new Set(visited);
        nextVisited.add(Number(preparation.id));
        const nested = estimateRecipeCost(preparation.lines || [], items, recipes, nextVisited);
        unknown.push(...nested.unknown);
        if (nested.unknown.length === 0) unitCost = nested.cost / Number(preparation.output_quantity);
      }
    }
    if (!item || unitCost === null) {
      unknown.push(item?.name || line.item_name || 'Insumo desconocido');
      continue;
    }
    cost += unitCost * Number(line.quantity || 0);
  }
  return { cost: Math.round(cost * 100) / 100, unknown: [...new Set(unknown)] };
}

function normalizedName(value) {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

export function catalogDiagnostics({ items = [], recipes = [], products = [] } = {}) {
  const issues = [];
  const names = new Map();
  for (const item of items) {
    const key = normalizedName(item.name);
    if (!key) continue;
    if (names.has(key)) issues.push({ type: 'duplicate', label: `Insumo duplicado: ${item.name}` });
    else names.set(key, item.id);
    if (item.is_purchasable !== 0 && item.item_type !== 'Sub-receta / preparado' && itemUnitCost(item) === null) {
      issues.push({ type: 'missing-cost', label: `${item.name}: falta precio o cantidad de la presentación` });
    }
    if (!item.unit_id && !item.unit_code) issues.push({ type: 'missing-unit', label: `${item.name}: falta unidad base` });
  }

  const productIds = new Set(products.map((product) => String(product.id)));
  for (const recipe of recipes) {
    if (recipe.recipe_type === 'product') {
      const productId = String(recipe.recipe_key || '').replace(/^product:/, '');
      if (productId && !productIds.has(productId)) issues.push({ type: 'orphan', label: `${recipe.name}: receta sin producto publicado` });
    }
    if (!(recipe.lines || []).length) issues.push({ type: 'empty-recipe', label: `${recipe.name}: no tiene ingredientes` });
    if (recipe.recipe_type === 'subrecipe' && !(Number(recipe.output_quantity) > 0)) {
      issues.push({ type: 'missing-yield', label: `${recipe.name}: falta indicar cuánto produce una tanda` });
    }
  }
  return issues;
}
