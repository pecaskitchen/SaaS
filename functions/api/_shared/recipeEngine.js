// Motor de explosion de receta y costeo basico (Fase 1). Compartido entre
// el endpoint de costeo (stock-costs.js) y el descuento de stock de
// pedidos en vivo (orders-dashboard.js).
//
// Hallazgo clave que define el diseno: hoy, cuando una receta de producto
// usa una subreceta como ingrediente (ej. "Blue cheese de la casa"), el
// comportamiento correcto es descontar el stock PROPIO de esa subreceta
// (se produce por lote con produceSubRecipe, que ya descuenta sus
// ingredientes crudos en el momento de produccion). Si al vender
// "explotaramos" esa subreceta a sus ingredientes crudos otra vez, se
// descontarian dos veces. Por eso explodeRecipe tiene dos modos:
//
// - 'costing': SIEMPRE recursa a la receta de una subreceta si existe una
//   activa -- una subreceta no tiene purchase_price propio (no se compra,
//   se produce), asi que la unica forma de conocer su costo real es
//   explotar sus componentes.
// - 'consumption': recursa a la receta de una subreceta SOLO SI
//   items.deducts_inventory = 0 en esa subreceta (no se trackea como
//   stock propio). Si deducts_inventory = 1 (caso real actual: chipotle,
//   blue cheese), se trata como linea hoja consumible tal cual -- el
//   comportamiento de hoy, preservado.

async function fetchRecipe(env, tenantId, recipeId) {
  return env.DB.prepare(
    `SELECT * FROM recipes WHERE tenant_id = ? AND id = ? AND is_active = 1`
  ).bind(tenantId, recipeId).first();
}

async function fetchRecipeLines(env, tenantId, recipeId) {
  const result = await env.DB.prepare(
    `SELECT l.*, i.name AS item_name, i.type AS item_type, i.deducts_inventory,
            i.purchase_price, i.purchase_unit_quantity, u.code AS unit_code
     FROM recipe_lines l
     LEFT JOIN items i ON i.id = l.item_id AND i.tenant_id = l.tenant_id
     LEFT JOIN stock_units u ON u.id = i.unit_id
     WHERE l.tenant_id = ? AND l.recipe_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`
  ).bind(tenantId, recipeId).all();
  return result.results || [];
}

async function findActiveSubrecipeForItem(env, tenantId, itemId) {
  return env.DB.prepare(
    `SELECT id FROM recipes WHERE tenant_id = ? AND item_id = ? AND recipe_type = 'subrecipe' AND is_active = 1 LIMIT 1`
  ).bind(tenantId, itemId).first();
}

/**
 * Expande una receta a sus componentes finales en unidad base.
 * @param {'costing'|'consumption'} options.mode
 * @returns {{ lines: Array<{itemId, itemName, quantity, unitCode, lineRole, deductsInventory, purchasePrice, purchaseUnitQuantity}> }}
 */
export async function explodeRecipe(env, tenantId, recipeId, quantity, options = {}) {
  const { mode, visited = new Set(), maxDepth = 10, depth = 0 } = options;
  if (!mode) throw new Error('explodeRecipe requiere options.mode ("costing" o "consumption").');
  if (depth > maxDepth) {
    throw new Error(`Profundidad maxima de receta excedida (recipeId=${recipeId}) -- posible ciclo no detectado.`);
  }
  if (visited.has(recipeId)) {
    throw new Error(`Ciclo detectado en la receta ${recipeId} -- una subreceta no puede contenerse a si misma directa o indirectamente.`);
  }
  const nextVisited = new Set(visited);
  nextVisited.add(recipeId);

  const recipe = await fetchRecipe(env, tenantId, recipeId);
  if (!recipe) return { lines: [] };

  // Recetas de producto guardan output_quantity=0 por convencion (no
  // tienen rendimiento propio, "quantity" es simplemente cuantas veces
  // se corre la receta). Recetas de subreceta si tienen un rendimiento
  // real que hay que usar como divisor de escala.
  const baseYield = Number(recipe.output_quantity || 0) || 1;
  const factor = Number(quantity || 0) / baseYield;

  const rawLines = await fetchRecipeLines(env, tenantId, recipeId);
  const flattened = [];

  for (const line of rawLines) {
    if (!line.item_name) continue; // ingrediente borrado -- el llamador ya loguea esto, no es responsabilidad de esta funcion
    const lineQuantity = Number(line.quantity || 0) * factor;
    const isSubrecipe = line.item_type === 'subrecipe';
    const shouldExpand = isSubrecipe && (mode === 'costing' || Number(line.deducts_inventory || 0) === 0);

    if (shouldExpand) {
      const subRecipe = await findActiveSubrecipeForItem(env, tenantId, line.item_id);
      if (subRecipe?.id) {
        const nested = await explodeRecipe(env, tenantId, subRecipe.id, lineQuantity, {
          mode, visited: nextVisited, maxDepth, depth: depth + 1,
        });
        flattened.push(...nested.lines);
        continue;
      }
      // Subreceta sin receta activa todavia -- se trata como hoja (fallback razonable, no bloquea el calculo).
    }

    flattened.push({
      itemId: line.item_id,
      itemName: line.item_name,
      quantity: lineQuantity,
      unitCode: line.unit_code || '',
      lineRole: line.line_role,
      deductsInventory: Number(line.deducts_inventory || 0) === 1,
      purchasePrice: Number(line.purchase_price || 0),
      purchaseUnitQuantity: Number(line.purchase_unit_quantity || 0),
    });
  }

  // Suma por item_id -- una receta puede llegar al mismo ingrediente por
  // dos caminos distintos (ej. lechuga directa + lechuga dentro de una
  // subreceta expandida), y el consumo real es aditivo en ese caso.
  const merged = new Map();
  for (const line of flattened) {
    if (merged.has(line.itemId)) {
      merged.get(line.itemId).quantity += line.quantity;
    } else {
      merged.set(line.itemId, { ...line });
    }
  }

  return { lines: Array.from(merged.values()) };
}

export function explodeRecipeForCosting(env, tenantId, recipeId, quantity) {
  return explodeRecipe(env, tenantId, recipeId, quantity, { mode: 'costing' });
}

export function explodeRecipeForConsumption(env, tenantId, recipeId, quantity) {
  return explodeRecipe(env, tenantId, recipeId, quantity, { mode: 'consumption' });
}

// -----------------------------------------------------------------------
// Costeo basico
// -----------------------------------------------------------------------

export function calculateItemUnitCost(item) {
  const purchasePrice = Number(item?.purchasePrice ?? item?.purchase_price ?? 0);
  const purchaseUnitQuantity = Number(item?.purchaseUnitQuantity ?? item?.purchase_unit_quantity ?? 0);
  if (!purchaseUnitQuantity) return { unitCost: null, costUnknown: true };
  return { unitCost: purchasePrice / purchaseUnitQuantity, costUnknown: false };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Costo total de una receta, expandiendo subrecetas recursivamente. El
 * rollup de subrecetas sale gratis de la propia recursion de
 * explodeRecipe en modo 'costing' -- no hace falta una funcion de
 * costeo recursiva aparte.
 */
export async function calculateRecipeCost(env, tenantId, recipeId, quantity = 1) {
  const recipe = await env.DB.prepare(`SELECT * FROM recipes WHERE tenant_id = ? AND id = ?`).bind(tenantId, recipeId).first();
  if (!recipe) return null;

  const { lines } = await explodeRecipeForCosting(env, tenantId, recipeId, quantity);
  let costTotal = 0;
  const costUnknownItems = [];
  for (const line of lines) {
    const { unitCost, costUnknown } = calculateItemUnitCost(line);
    if (costUnknown) {
      costUnknownItems.push(line.itemName);
      continue;
    }
    costTotal += unitCost * line.quantity;
  }

  let price = null;
  let productKey = null;
  if (recipe.item_id) {
    const product = await env.DB.prepare(
      `SELECT product_key, price FROM menu_products WHERE tenant_id = ? AND item_id = ?`
    ).bind(tenantId, recipe.item_id).first();
    if (product) {
      productKey = product.product_key;
      price = Number(product.price || 0);
    }
  }

  const grossMargin = price !== null ? price - costTotal : null;
  const grossMarginPercent = price ? (grossMargin / price) * 100 : null;

  return {
    recipeId: recipe.id,
    productId: productKey,
    costTotal: round2(costTotal),
    price,
    grossMargin: grossMargin !== null ? round2(grossMargin) : null,
    grossMarginPercent: grossMarginPercent !== null ? round2(grossMarginPercent) : null,
    costUnknownItems,
  };
}
