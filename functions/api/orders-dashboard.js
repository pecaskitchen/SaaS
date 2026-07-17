import { DEFAULT_BRANCH_SETTINGS, normalizeBranchSettings } from './_shared/branchSettings.js';
import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';
import { explodeRecipeForConsumption } from './_shared/recipeEngine.js';
import { rebuildCustomerFromOrderIdentity } from './_shared/crm.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Solo JWT: se retiro el login por PIN de sucursal. El acceso a pedidos es
// exclusivamente por cuenta individual (email + contrasena).
async function resolveOrdersAccess(request, env) {
  // Rediseno de roles: 'manager' tambien ve el modulo Pedidos.
  const auth = await requireAuth(request, env, ['admin', 'manager', 'orders', 'platform_admin']);
  if (!auth.ok) return { ok: false, error: 'No autorizado.', response: auth.response };

  // canArchive: archivar/eliminar excluye pedidos de ventas/reportes/CRM de
  // forma permanente, asi que se reserva a duenos y gerentes (mismo criterio
  // que el DELETE de crm/customers.js). El rol operativo "orders" no puede
  // ocultar ventas.
  if (auth.session.role === 'admin' || auth.session.role === 'platform_admin') {
    return { ok: true, role: 'admin', branchFilter: 'all', accessScope: 'all', canArchive: true };
  }
  return { ok: true, role: 'orders', branchFilter: 'all', accessScope: 'legacy', canArchive: auth.session.role === 'manager' };
}



function hideBranchPasswords(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return {
    ...normalized,
    branches: (normalized.branches || []).map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch),
  };
}

function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
    const parsed = JSON.parse(raw);
    return { branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

async function readBranchSettings(env, tenantId) {
  try {
    await ensureTenantColumns(env, ['app_settings']);
    const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
    const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
    return normalizeSavedMenu(row?.value_json || '').branchSettings;
  } catch {
    return normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS);
  }
}

function getTimestamps() {
  const now = new Date();
  const monterreyTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return { utc: now.toISOString(), monterrey: monterreyTime };
}

function getMonterreyDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')) };
}

function formatDateOnly(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getBusinessWindowMonterrey() {
  const parts = getMonterreyDateParts();
  const businessDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (parts.hour < 3) businessDate.setUTCDate(businessDate.getUTCDate() - 1);
  const nextDate = new Date(businessDate.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { start: `${formatDateOnly(businessDate)} 03:00:00`, end: `${formatDateOnly(nextDate)} 03:00:00` };
}


// Cacheados a nivel de modulo -- ambos corren en cada request de
// pedidos/dashboard; una vez verificados en este isolate no hace falta
// repetir los CREATE TABLE/PRAGMA/ALTER en cada request.
let stockBranchColumnsEnsured = false;
let orderStockColumnsEnsured = false;

async function ensureStockBranchColumns(env) {
  if (stockBranchColumnsEnsured) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_branch_stock (
      tenant_id TEXT NOT NULL DEFAULT 'default',
      item_id INTEGER NOT NULL,
      branch_id TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      updated_at_utc TEXT NOT NULL,
      PRIMARY KEY (tenant_id, item_id, branch_id)
    )`).run();
    await ensureTenantColumns(env, ['inventory_branch_stock', 'stock_movements']);
    const info = await env.DB.prepare(`PRAGMA table_info(stock_movements)`).all();
    const columns = new Set((info.results || []).map((row) => row.name));
    if (!columns.has('branch_id')) await env.DB.prepare(`ALTER TABLE stock_movements ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`).run();
    if (!columns.has('branch_name')) await env.DB.prepare(`ALTER TABLE stock_movements ADD COLUMN branch_name TEXT`).run();
    stockBranchColumnsEnsured = true;
  } catch {
    // Stock schema may not be initialized yet. The insert will surface a useful error if needed.
  }
}

async function ensureOrderStockColumns(env) {
  if (orderStockColumnsEnsured) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      branch_id TEXT NOT NULL DEFAULT 'dominio',
      branch_name TEXT NOT NULL DEFAULT 'Dominio',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      customer_notes TEXT,
      subtotal INTEGER NOT NULL DEFAULT 0,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      whatsapp_message TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Monterrey',
      updated_at_utc TEXT NOT NULL,
      updated_at_monterrey TEXT NOT NULL,
      stock_deducted INTEGER NOT NULL DEFAULT 0,
      stock_deducted_at_utc TEXT,
      stock_deducted_at_monterrey TEXT,
      stock_deduction_error TEXT,
      order_source TEXT NOT NULL DEFAULT 'online',
      cashier_name TEXT,
      cashier_shift TEXT,
      payment_method TEXT,
      payment_status TEXT
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      order_id INTEGER NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL DEFAULT 0,
      line_total INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      item_notes TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      order_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_note TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `).run();

  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_created_at_monterrey ON orders(created_at_monterrey)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at_monterrey)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_tenant_order_number ON orders(tenant_id, order_number)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order ON order_items(tenant_id, order_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_events_tenant_order ON order_events(tenant_id, order_id)`).run();
  await ensureTenantColumns(env, ['orders', 'order_items', 'order_events']);

  const info = await env.DB.prepare(`PRAGMA table_info(orders)`).all();
  const columns = new Set((info.results || []).map((row) => row.name));
  const alters = [];
  if (!columns.has('stock_deducted')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has('stock_deducted_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted_at_utc TEXT`);
  if (!columns.has('stock_deducted_at_monterrey')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted_at_monterrey TEXT`);
  if (!columns.has('stock_deduction_error')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deduction_error TEXT`);
  if (!columns.has('branch_id')) alters.push(`ALTER TABLE orders ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`);
  if (!columns.has('branch_name')) alters.push(`ALTER TABLE orders ADD COLUMN branch_name TEXT NOT NULL DEFAULT 'Dominio'`);
  if (!columns.has('order_source')) alters.push(`ALTER TABLE orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'online'`);
  if (!columns.has('cashier_name')) alters.push(`ALTER TABLE orders ADD COLUMN cashier_name TEXT`);
  if (!columns.has('cashier_shift')) alters.push(`ALTER TABLE orders ADD COLUMN cashier_shift TEXT`);
  if (!columns.has('payment_method')) alters.push(`ALTER TABLE orders ADD COLUMN payment_method TEXT`);
  if (!columns.has('payment_status')) alters.push(`ALTER TABLE orders ADD COLUMN payment_status TEXT`);
  if (!columns.has('exclude_from_reports')) alters.push(`ALTER TABLE orders ADD COLUMN exclude_from_reports INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has('archived_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN archived_at_utc TEXT`);
  if (!columns.has('archived_reason')) alters.push(`ALTER TABLE orders ADD COLUMN archived_reason TEXT`);
  if (!columns.has('deleted_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN deleted_at_utc TEXT`);
  for (const sql of alters) await env.DB.prepare(sql).run();
  orderStockColumnsEnsured = true;
}

function parseOptions(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugifyRecipePart(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function recipeKeyCandidates(productId, productName) {
  const candidates = [];
  const add = (value) => {
    const clean = String(value || '').trim();
    if (clean && !candidates.includes(clean)) candidates.push(clean);
  };
  const cleanId = String(productId || '').trim();
  if (cleanId) {
    add(cleanId.startsWith('product:') ? cleanId : `product:${cleanId}`);
    add(`product:${slugifyRecipePart(cleanId)}`);
  }
  const cleanName = String(productName || '').trim();
  if (cleanName) add(`product:${slugifyRecipePart(cleanName)}`);
  return candidates;
}

function selectedOptionNames(options = {}) {
  const names = [];
  const add = (value) => {
    if (!value || value === 'N/A' || value === 'Ninguno' || value === 'Sin jarabe' || value === 'Sin aderezo') return;
    names.push(String(value));
  };
  if (Array.isArray(options.flavors)) options.flavors.forEach(add);
  if (Array.isArray(options.extraToppings)) options.extraToppings.forEach(add);
  if (Array.isArray(options.recipeExtras)) options.recipeExtras.forEach(add);
  if (Array.isArray(options.changedInternalDressings)) options.changedInternalDressings.forEach(add);
  add(options.changedInternalDressing);
  add(options.milk);
  add(options.syrup);
  add(options.sideDressing);
  add(options.extraDressing);
  add(options.saladDressing);
  if (options.optionGroups && typeof options.optionGroups === 'object') {
    for (const value of Object.values(options.optionGroups)) {
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
    }
  }
  if (options.whippedCream) add('Crema batida');
  return names.map(normalizeText);
}

function removedOptionNames(options = {}) {
  const removed = [];
  if (Array.isArray(options.removedIngredients)) removed.push(...options.removedIngredients);
  if (Array.isArray(options.removed)) removed.push(...options.removed);
  return removed.map(normalizeText);
}

function shouldUseRecipeLine(line, options = {}) {
  if (!line) return false;
  const itemName = normalizeText(line.item_name);
  const selected = selectedOptionNames(options);
  const removed = removedOptionNames(options);
  if (removed.includes(itemName)) return false;

  const role = String(line.line_role || 'ingrediente');
  const isAlternativeChangeable = Number(line.client_changeable || 0) === 1 && Number(line.is_default || 0) !== 1;
  const isCustomerOption = role === 'opcion_cliente' || Number(line.is_optional || 0) === 1 || isAlternativeChangeable;

  if (isCustomerOption) {
    return selected.includes(itemName);
  }

  return true;
}

async function getRecipeLinesForProduct(env, productId, productName = '', tenantId) {
  let recipe = null;

  // Fuente de verdad real: menu_products.recipe_id, el link que ya guarda
  // el catalogo entre producto y receta. Antes esto se ignoraba y se
  // adivinaba por recipe_key/nombre mas abajo -- si dos recetas
  // compartian nombre, podia descontar la receta equivocada sin error.
  if (productId) {
    const linked = await env.DB.prepare(
      `SELECT r.id FROM menu_products p
       JOIN recipes r ON r.tenant_id = p.tenant_id AND r.id = p.recipe_id
       WHERE p.tenant_id = ? AND p.product_key = ? AND r.recipe_type = 'product' AND r.is_active = 1`
    ).bind(tenantId, productId).first();
    if (linked?.id) recipe = linked;
  }

  // Fallback para productos que todavia no tienen recipe_id enlazado en
  // el catalogo (legado) -- mismo comportamiento que antes.
  const candidates = recipe?.id ? [] : recipeKeyCandidates(productId, productName);
  for (const recipeKey of candidates) {
    recipe = await env.DB.prepare(
      `SELECT id FROM recipes WHERE tenant_id = ? AND lower(recipe_key) = lower(?) AND recipe_type = 'product' AND is_active = 1`
    ).bind(tenantId, recipeKey).first();
    if (recipe?.id) break;
  }
  if (!recipe?.id && productName) {
    recipe = await env.DB.prepare(
      `SELECT id FROM recipes WHERE tenant_id = ? AND lower(name) = lower(?) AND recipe_type = 'product' AND is_active = 1 ORDER BY updated_at_utc DESC, id DESC LIMIT 1`
    ).bind(tenantId, String(productName || '').trim()).first();
  }
  if (!recipe?.id) return [];

  // LEFT JOIN (no INNER) para poder detectar lineas de receta cuyo
  // ingrediente ya no existe -- con INNER JOIN esas lineas simplemente
  // desaparecian del resultado sin avisar, subestimando el consumo real
  // sin que nadie se entere.
  const result = await env.DB.prepare(
    `SELECT l.*, i.name AS item_name, i.current_stock, i.deducts_inventory, i.type AS item_type, u.code AS unit_code
     FROM recipe_lines l
     LEFT JOIN items i ON i.id = l.item_id AND i.tenant_id = ?
     LEFT JOIN stock_units u ON u.id = i.unit_id
     WHERE l.tenant_id = ? AND l.recipe_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`
  ).bind(tenantId, tenantId, recipe.id).all();
  const lines = [];
  for (const row of result.results || []) {
    if (!row.item_name) {
      console.warn(`[stock] receta ${recipe.id} (tenant ${tenantId}) referencia item_id ${row.item_id} que no existe -- linea ignorada en el descuento de inventario.`);
      continue;
    }
    lines.push(row);
  }
  return lines;
}

async function getSelectedFamilyComponents(env, productId, options = {}, tenantId) {
  const selections = options.optionGroups && typeof options.optionGroups === 'object' ? options.optionGroups : {};
  const selectedPairs = [];
  for (const [familyKey, raw] of Object.entries(selections)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const optionName = String(value || '').trim();
      if (optionName) selectedPairs.push({ familyKey, optionName });
    }
  }
  if (!selectedPairs.length) return [];
  const rows = [];
  for (const pair of selectedPairs) {
    try {
      // LEFT JOIN a items (no INNER) para poder detectar
      // items borrados en vez de que la fila desaparezca en silencio.
      const result = await env.DB.prepare(
        `SELECT oi.item_id, oi.quantity, i.name AS item_name, i.deducts_inventory, u.code AS unit_code
         FROM stock_product_option_groups pg
         JOIN stock_option_families f ON f.id = pg.family_id
         JOIN stock_option_family_items oi ON oi.family_id = f.id
         LEFT JOIN items i ON i.id = oi.item_id AND i.tenant_id = ?
         LEFT JOIN stock_units u ON u.id = i.unit_id
         WHERE pg.tenant_id = ? AND f.tenant_id = ? AND oi.tenant_id = ? AND pg.product_id = ? AND pg.is_active = 1 AND f.family_key = ? AND lower(oi.option_name) = lower(?) AND oi.is_active = 1
        UNION ALL
        SELECT c.item_id, c.quantity, i.name AS item_name, i.deducts_inventory, u.code AS unit_code
         FROM stock_product_option_groups pg
         JOIN stock_option_families f ON f.id = pg.family_id
         JOIN stock_option_family_items oi ON oi.family_id = f.id
         JOIN stock_option_family_item_components c ON c.option_item_id = oi.id
         LEFT JOIN items i ON i.id = c.item_id AND i.tenant_id = ?
         LEFT JOIN stock_units u ON u.id = i.unit_id
         WHERE pg.tenant_id = ? AND f.tenant_id = ? AND oi.tenant_id = ? AND c.tenant_id = ? AND pg.product_id = ? AND pg.is_active = 1 AND f.family_key = ? AND lower(oi.option_name) = lower(?) AND oi.is_active = 1`
      ).bind(
        tenantId, tenantId, tenantId, tenantId, productId, pair.familyKey, pair.optionName,
        tenantId, tenantId, tenantId, tenantId, tenantId, productId, pair.familyKey, pair.optionName
      ).all();
      // El primer SELECT trae el item propio de la opcion, el segundo
      // (UNION ALL) trae sus componentes -- son aditivos por diseno
      // (ej. "Sandwich de pollo" = pechuga + pan + mayo). Pero si un
      // admin carga por error el MISMO item tambien como componente de
      // su propia opcion, se descontaria dos veces. Se deduplica por
      // item_id dentro de esta misma opcion (se queda con la primera
      // fila, que es siempre la del item propio por el orden del UNION).
      const seenItemIds = new Set();
      for (const row of result.results || []) {
        if (!row.item_name) {
          console.warn(`[stock] opcion "${pair.optionName}" de familia "${pair.familyKey}" (producto ${productId}, tenant ${tenantId}) referencia item_id ${row.item_id} que no existe -- linea ignorada en el descuento de inventario.`);
          continue;
        }
        if (seenItemIds.has(row.item_id)) continue;
        seenItemIds.add(row.item_id);
        rows.push(row);
      }
    } catch { /* components table may not exist before first stock load */ }
  }
  return rows;
}

async function aggregateOrderConsumption(env, orderId, tenantId) {
  const itemsResult = await env.DB.prepare(
    `SELECT * FROM order_items WHERE tenant_id = ? AND order_id = ? ORDER BY id ASC`
  ).bind(tenantId, orderId).all();

  const orderItems = itemsResult.results || [];

  // Memoizacion por request: un pedido con varias lineas del mismo
  // producto (o un combo/promo que repite productos) antes recalculaba
  // el lookup completo de receta/familia por cada linea repetida.
  const recipeLinesCache = new Map();
  const getRecipeLinesCached = async (productId, productName) => {
    if (recipeLinesCache.has(productId)) return recipeLinesCache.get(productId);
    const lines = await getRecipeLinesForProduct(env, productId, productName, tenantId);
    recipeLinesCache.set(productId, lines);
    return lines;
  };
  const familyComponentsCache = new Map();
  const getFamilyComponentsCached = async (productId, options) => {
    const cacheKey = `${productId}:${JSON.stringify(options?.optionGroups || {})}`;
    if (familyComponentsCache.has(cacheKey)) return familyComponentsCache.get(cacheKey);
    const components = await getSelectedFamilyComponents(env, productId, options, tenantId);
    familyComponentsCache.set(cacheKey, components);
    return components;
  };
  const consumption = new Map();
  const missingRecipes = [];
  const stats = {
    orderItemCount: orderItems.length,
    recipeLineCount: 0,
    matchedLineCount: 0,
    skippedNoInventory: [],
    skippedNoQuantity: [],
    skippedByOptions: [],
  };

  const addLine = (line, multiplier) => {
    if (!Number(line.deducts_inventory ?? 1)) {
      stats.skippedNoInventory.push(line.item_name || `Ingrediente ${line.item_id}`);
      return;
    }
    const qty = Number(line.quantity || 0) * multiplier;
    if (!qty) {
      stats.skippedNoQuantity.push(line.item_name || `Ingrediente ${line.item_id}`);
      return;
    }
    const existing = consumption.get(line.item_id) || {
      item_id: line.item_id,
      item_name: line.item_name,
      unit_code: line.unit_code,
      quantity: 0,
    };
    existing.quantity += qty;
    consumption.set(line.item_id, existing);
  };

  // Fase 1: si la linea de receta apunta a una subreceta que NO se
  // trackea como stock propio (deducts_inventory=0 -- hoy no existe
  // ningun caso real asi en los datos de Pecas, pero el modelo nuevo lo
  // soporta), se explota a sus ingredientes crudos via explodeRecipe en
  // modo 'consumption'. Si la subreceta SI se trackea (deducts_inventory=1
  // -- caso real actual: aderezo chipotle, blue cheese), se consume como
  // hoja tal cual, exactamente el comportamiento de hoy: ya se descontaron
  // sus ingredientes crudos cuando se PRODUJO el lote (produceSubRecipe),
  // asi que volver a explotarla aqui duplicaria el descuento.
  const addLineOrExpand = async (line, multiplier) => {
    if (line.item_type !== 'subrecipe' || Number(line.deducts_inventory || 0) !== 0) {
      addLine(line, multiplier);
      return;
    }
    const scaledQuantity = Number(line.quantity || 0) * multiplier;
    if (!scaledQuantity) {
      stats.skippedNoQuantity.push(line.item_name || `Ingrediente ${line.item_id}`);
      return;
    }
    const subRecipe = await env.DB.prepare(
      `SELECT id FROM recipes WHERE tenant_id = ? AND item_id = ? AND recipe_type = 'subrecipe' AND is_active = 1 LIMIT 1`
    ).bind(tenantId, line.item_id).first();
    if (!subRecipe?.id) {
      addLine(line, multiplier);
      return;
    }
    const { lines: expandedLines } = await explodeRecipeForConsumption(env, tenantId, subRecipe.id, scaledQuantity);
    stats.recipeLineCount += expandedLines.length;
    for (const expandedLine of expandedLines) {
      stats.matchedLineCount += 1;
      addLine({
        item_id: expandedLine.itemId,
        item_name: expandedLine.itemName,
        unit_code: expandedLine.unitCode,
        quantity: expandedLine.quantity,
        deducts_inventory: expandedLine.deductsInventory ? 1 : 0,
      }, 1);
    }
  };

  for (const orderItem of orderItems) {
    const options = parseOptions(orderItem.options_json);

    if (orderItem.product_id === 'promo' && Array.isArray(options.promoItems)) {
      for (const promoItem of options.promoItems) {
        const productId = promoItem.productId;
        const multiplier = Number(promoItem.quantity || 1) * Number(orderItem.quantity || 1);
        const lines = await getRecipeLinesCached(productId, promoItem.productName);
        if (lines.length === 0) missingRecipes.push(promoItem.productName || productId);
        stats.recipeLineCount += lines.length;
        const promoOptions = options.extrasByProductId?.[productId] || {};
        for (const line of lines) {
          if (shouldUseRecipeLine(line, promoOptions)) {
            stats.matchedLineCount += 1;
            await addLineOrExpand(line, multiplier);
          } else {
            stats.skippedByOptions.push(line.item_name || `Ingrediente ${line.item_id}`);
          }
        }
        const familyComponents = await getFamilyComponentsCached(productId, promoOptions);
        stats.recipeLineCount += familyComponents.length;
        for (const component of familyComponents) addLine(component, multiplier);
      }
      continue;
    }

    const productId = orderItem.product_id || orderItem.productId || orderItem.id;
    const lines = await getRecipeLinesCached(productId, orderItem.product_name);
    if (lines.length === 0) missingRecipes.push(orderItem.product_name || productId);
    stats.recipeLineCount += lines.length;
    const multiplier = Number(orderItem.quantity || 1);
    for (const line of lines) {
      if (shouldUseRecipeLine(line, options)) {
        stats.matchedLineCount += 1;
        await addLineOrExpand(line, multiplier);
      } else {
        stats.skippedByOptions.push(line.item_name || `Ingrediente ${line.item_id}`);
      }
    }
    const familyComponents = await getFamilyComponentsCached(productId, options);
    stats.recipeLineCount += familyComponents.length;
    for (const component of familyComponents) addLine(component, multiplier);
  }

  return { consumption: [...consumption.values()], missingRecipes, stats };
}


// getBranchStock() llama a esto por cada linea de consumo de un pedido
// -- se cachea por (tenant, branch) a nivel de modulo para no repetir
// el CREATE TABLE/COUNT/INSERT set-based en cada linea del mismo
// pedido/isolate. El backfill se retoma solo en el proximo cold start,
// lo cual es seguro: getBranchStock/setBranchStock ya manejan por su
// cuenta el caso de una fila de branch_stock todavia inexistente.
const branchStockEnsuredCache = new Set();

async function ensureBranchStock(env, branchId, tenantId) {
  const cacheKey = `${tenantId}:${branchId}`;
  if (branchStockEnsuredCache.has(cacheKey)) return;
  const ts = getTimestamps();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_branch_stock (
    tenant_id TEXT NOT NULL DEFAULT 'default',
    item_id INTEGER NOT NULL,
    branch_id TEXT NOT NULL,
    current_stock REAL NOT NULL DEFAULT 0,
    updated_at_utc TEXT NOT NULL,
    PRIMARY KEY (tenant_id, item_id, branch_id)
  )`).run();
  await ensureTenantColumns(env, ['inventory_branch_stock']);
  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM inventory_branch_stock WHERE tenant_id = ? AND branch_id = ?`).bind(tenantId, branchId).first();
  const count = Number(countRow?.count || 0);
  // Backfill set-based en vez de un SELECT+INSERT por item -- con
  // cientos de ingredientes esto pasaba de cientos de round trips a 1.
  // INSERT OR IGNORE ya respeta el PRIMARY KEY (tenant_id, item_id,
  // branch_id), asi que reemplaza el "if (existing) continue" anterior
  // sin cambiar el comportamiento.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO inventory_branch_stock (tenant_id, item_id, branch_id, current_stock, updated_at_utc)
    SELECT tenant_id, id, ?, CASE WHEN ? = 0 THEN current_stock ELSE 0 END, ?
    FROM items
    WHERE tenant_id = ?
  `).bind(branchId, count, ts.utc, tenantId).run();
  branchStockEnsuredCache.add(cacheKey);
}

async function getBranchStock(env, itemId, branchId, tenantId) {
  await ensureBranchStock(env, branchId, tenantId);
  const row = await env.DB.prepare(`SELECT current_stock FROM inventory_branch_stock WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`).bind(tenantId, itemId, branchId).first();
  if (row) return Number(row.current_stock || 0);
  const item = await env.DB.prepare(`SELECT current_stock FROM items WHERE tenant_id = ? AND id = ?`).bind(tenantId, itemId).first();
  return Number(item?.current_stock || 0);
}

async function setBranchStock(env, itemId, branchId, nextStock, tenantId) {
  const ts = getTimestamps();
  const update = await env.DB.prepare(
    `UPDATE inventory_branch_stock SET current_stock = ?, updated_at_utc = ? WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`
  ).bind(Number(nextStock || 0), ts.utc, tenantId, itemId, branchId).run();
  if (Number(update.meta?.changes || 0) === 0) {
    await env.DB.prepare(`INSERT OR IGNORE INTO inventory_branch_stock (tenant_id, item_id, branch_id, current_stock, updated_at_utc)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(tenantId, itemId, branchId, Number(nextStock || 0), ts.utc).run();
  }
}

async function deductOrderStock(env, orderId, orderNumber, tenantId) {
  await ensureOrderStockColumns(env);
  await ensureStockBranchColumns(env);
  const order = await env.DB.prepare(`SELECT id, order_number, stock_deducted, branch_id, branch_name FROM orders WHERE tenant_id = ? AND id = ?`).bind(tenantId, orderId).first();
  if (!order) throw new Error('Pedido no encontrado.');
  if (Number(order.stock_deducted || 0) === 1) return { skipped: true, reason: 'El stock ya estaba descontado.' };

  const { consumption, missingRecipes, stats } = await aggregateOrderConsumption(env, orderId, tenantId);
  if (consumption.length === 0) {
    if (!stats.orderItemCount) throw new Error('El pedido no tiene productos guardados en order_items. Crea un pedido nuevo para probar descuento.');
    if (missingRecipes.length) throw new Error(`No hay recetas configuradas para: ${missingRecipes.join(', ')}`);
    if (!stats.recipeLineCount) throw new Error('La receta del producto no tiene ingredientes guardados.');
    if (stats.skippedNoInventory.length) throw new Error(`Los ingredientes de la receta estan marcados como "no descuentan inventario": ${[...new Set(stats.skippedNoInventory)].join(', ')}`);
    if (stats.skippedNoQuantity.length) throw new Error(`Las lineas de receta tienen cantidad 0: ${[...new Set(stats.skippedNoQuantity)].join(', ')}`);
    if (stats.skippedByOptions.length) throw new Error(`Las lineas de receta son opcionales y no fueron seleccionadas en el pedido: ${[...new Set(stats.skippedByOptions)].join(', ')}`);
    throw new Error('No hay consumo de stock para este pedido.');
  }

  const branchId = order.branch_id || 'dominio';
  const shortages = [];
  // Se guarda el stock "current" leido aca para reusarlo en el loop de
  // abajo -- antes se volvia a leer con un segundo getBranchStock por
  // linea, una llamada redundante ya que nada mas modifica el stock
  // entre estos dos loops dentro del mismo request.
  const currentStockByItem = new Map();
  for (const line of consumption) {
    const current = await getBranchStock(env, line.item_id, branchId, tenantId);
    currentStockByItem.set(line.item_id, current);
    if (current < Number(line.quantity || 0)) {
      shortages.push(`${line.item_name}: tienes ${current} ${line.unit_code || ''}, se necesitan ${line.quantity} ${line.unit_code || ''}`.trim());
    }
  }
  if (shortages.length > 0) {
    throw new Error(`Stock insuficiente. ${shortages.join(' | ')}`);
  }

  const ts = getTimestamps();
  for (const line of consumption) {
    const before = currentStockByItem.get(line.item_id);
    const qty = -Math.abs(Number(line.quantity || 0));
    const after = before + qty;
    await setBranchStock(env, line.item_id, order.branch_id || 'dominio', after, tenantId);
    if ((order.branch_id || 'dominio') === 'dominio') {
      await env.DB.prepare(`UPDATE items SET current_stock = ?, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(after, ts.utc, tenantId, line.item_id).run();
    } else {
      await env.DB.prepare(`UPDATE items SET updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(ts.utc, tenantId, line.item_id).run();
    }
    await env.DB.prepare(
      `INSERT INTO stock_movements (
        tenant_id, item_id, movement_type, quantity, stock_before, stock_after, reason, source_type, source_id,
        reported_by, reported_role, reported_shift, approved_by, branch_id, branch_name, created_at_utc, created_at_monterrey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tenantId,
      line.item_id,
      'salida_pedido_listo',
      qty,
      before,
      after,
      `Pedido ${orderNumber || order.order_number || orderId} marcado como listo`,
      'order',
      String(orderId),
      'Orders',
      'system',
      'Operacion',
      null,
      order.branch_id || 'dominio',
      order.branch_name || 'Dominio',
      ts.utc,
      ts.monterrey
    ).run();
  }

  await env.DB.prepare(
    `UPDATE orders SET stock_deducted = 1, stock_deducted_at_utc = ?, stock_deducted_at_monterrey = ?, stock_deduction_error = NULL WHERE tenant_id = ? AND id = ?`
  ).bind(ts.utc, ts.monterrey, tenantId, orderId).run();

  return { skipped: false, deducted: consumption.length, missingRecipes };
}

async function loadFullOrders(env, status, limit, branchFilter = 'all', tenantId) {
  const businessWindow = getBusinessWindowMonterrey();
  let ordersQuery = `
    SELECT id, order_number, status, customer_name, customer_phone, customer_address, customer_neighborhood, customer_notes, custom_fields_json,
      subtotal, delivery_fee, total, whatsapp_message, created_at_utc, created_at_monterrey,
      updated_at_utc, updated_at_monterrey, branch_id, branch_name, order_source, cashier_name, cashier_shift, payment_method, payment_status,
      stock_deducted, stock_deducted_at_monterrey, stock_deduction_error, exclude_from_reports, archived_at_utc, deleted_at_utc
    FROM orders
    WHERE tenant_id = ? AND created_at_monterrey >= ? AND created_at_monterrey < ?
      AND deleted_at_utc IS NULL
      AND archived_at_utc IS NULL
      AND COALESCE(exclude_from_reports, 0) = 0`;
  const binds = [tenantId, businessWindow.start, businessWindow.end];
  if (status !== 'all') { ordersQuery += ` AND status = ?`; binds.push(status); }
  if (branchFilter && branchFilter !== 'all') { ordersQuery += ` AND COALESCE(branch_id, 'dominio') = ?`; binds.push(branchFilter); }
  ordersQuery += ` ORDER BY created_at_monterrey DESC LIMIT ?`;
  binds.push(limit);

  const ordersResult = await env.DB.prepare(ordersQuery).bind(...binds).all();
  const orders = ordersResult.results || [];
  if (!orders.length) return { businessWindow, orders: [] };

  // Antes: 2 queries POR pedido (hasta 200 round trips con el limite
  // por defecto de 100). Ahora: 2 queries totales con WHERE order_id IN
  // (...), agrupadas en JS por order_id.
  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const [itemsResult, eventsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, order_id, product_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes
       FROM order_items WHERE tenant_id = ? AND order_id IN (${placeholders}) ORDER BY id ASC`
    ).bind(tenantId, ...orderIds).all(),
    env.DB.prepare(
      `SELECT id, order_id, event_type, event_note, created_at_utc, created_at_monterrey
       FROM order_events WHERE tenant_id = ? AND order_id IN (${placeholders}) ORDER BY id ASC`
    ).bind(tenantId, ...orderIds).all(),
  ]);

  const itemsByOrderId = new Map();
  for (const item of itemsResult.results || []) {
    if (!itemsByOrderId.has(item.order_id)) itemsByOrderId.set(item.order_id, []);
    itemsByOrderId.get(item.order_id).push(item);
  }
  const eventsByOrderId = new Map();
  for (const event of eventsResult.results || []) {
    if (!eventsByOrderId.has(event.order_id)) eventsByOrderId.set(event.order_id, []);
    eventsByOrderId.get(event.order_id).push(event);
  }

  const fullOrders = orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) || [],
    events: eventsByOrderId.get(order.id) || [],
  }));
  return { businessWindow, orders: fullOrders };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const tenantId = await resolveTenantId(request, env);
    const access = await resolveOrdersAccess(request, env, tenantId);
    if (!access.ok) return jsonResponse({ ok: false, error: access.error || 'No autorizado.' }, 401);
    await ensureOrderStockColumns(env);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    // Acotado a 500 -- sin tope, un limit gigante generaria un WHERE
    // order_id IN (...) con miles de parametros en loadFullOrders.
    const limit = Math.min(Number(url.searchParams.get('limit') || 100) || 100, 500);
    const requestedBranchFilter = url.searchParams.get('branch') || 'all';
    // resolveOrdersAccess ya trae branchSettings salvo en el camino
    // rapido de admin (no lo necesita para autorizar) -- se reusa en
    // vez de volver a leerlo.
    const branchSettings = access.branchSettings || await readBranchSettings(env, tenantId);
    const branchFilter = access.accessScope === 'branch' ? access.branchFilter : requestedBranchFilter;
    const data = await loadFullOrders(env, status, limit, branchFilter, tenantId);
    return jsonResponse({ ok: true, role: access.role, accessScope: access.accessScope, canArchive: Boolean(access.canArchive), lockedBranchId: access.accessScope === 'branch' ? access.branchFilter : null, branchSettings: access.role === 'admin' ? branchSettings : hideBranchPasswords(branchSettings), ...data });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar los pedidos.', detail: error.message }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const tenantId = await resolveTenantId(request, env);
    const access = await resolveOrdersAccess(request, env, tenantId);
    if (!access.ok) return jsonResponse({ ok: false, error: access.error || 'No autorizado.' }, 401);
    await ensureOrderStockColumns(env);
    const body = await request.json();
    const { orderId, status, note = '', action = '' } = body;
    const allowedStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!orderId) return jsonResponse({ ok: false, error: 'Falta pedido.' }, 400);

    const order = await env.DB.prepare(`
      SELECT id, order_number, status, stock_deducted, branch_id, customer_name, customer_phone, customer_address, total, created_at_utc
      FROM orders
      WHERE tenant_id = ? AND id = ? AND deleted_at_utc IS NULL
    `).bind(tenantId, orderId).first();
    if (!order) return jsonResponse({ ok: false, error: 'Pedido no encontrado.' }, 404);
    if (access.accessScope === 'branch' && (order.branch_id || 'dominio') !== access.branchFilter) {
      return jsonResponse({ ok: false, error: 'No puedes modificar pedidos de otra sucursal.' }, 403);
    }

    const timestamps = getTimestamps();
    if (action === 'archive' || action === 'delete') {
      if (!access.canArchive) {
        return jsonResponse({ ok: false, error: 'Solo el dueño o un gerente pueden archivar o eliminar pedidos.' }, 403);
      }
      const isDelete = action === 'delete';
      const eventType = isDelete ? 'deleted' : 'archived';
      const eventNote = String(note || (isDelete ? 'Pedido eliminado de reportes y CRM.' : 'Pedido archivado de reportes y CRM.'));
      await env.DB.prepare(`
        UPDATE orders
        SET exclude_from_reports = 1,
          archived_at_utc = COALESCE(archived_at_utc, ?),
          archived_reason = ?,
          deleted_at_utc = CASE WHEN ? = 1 THEN ? ELSE deleted_at_utc END,
          updated_at_utc = ?,
          updated_at_monterrey = ?
        WHERE tenant_id = ? AND id = ?
      `).bind(
        timestamps.utc,
        eventNote,
        isDelete ? 1 : 0,
        timestamps.utc,
        timestamps.utc,
        timestamps.monterrey,
        tenantId,
        orderId,
      ).run();

      await env.DB.prepare(
        `INSERT INTO order_events (tenant_id, order_id, event_type, event_note, created_at_utc, created_at_monterrey)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(tenantId, orderId, eventType, eventNote, timestamps.utc, timestamps.monterrey).run();

      await rebuildCustomerFromOrderIdentity(env, tenantId, order);
      return jsonResponse({ ok: true, orderId, action, archived: true, deleted: isDelete });
    }

    if (!allowedStatuses.includes(status)) return jsonResponse({ ok: false, error: 'Estatus invalido.' }, 400);

    let stockResult = null;
    if (status === 'ready' && Number(order.stock_deducted || 0) !== 1) {
      try {
        stockResult = await deductOrderStock(env, orderId, order.order_number, tenantId);
      } catch (error) {
        await env.DB.prepare(`UPDATE orders SET stock_deduction_error = ? WHERE tenant_id = ? AND id = ?`).bind(error.message, tenantId, orderId).run();
        return jsonResponse({ ok: false, error: 'No se pudo descontar stock.', detail: error.message }, 400);
      }
    }

    await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
    ).bind(status, timestamps.utc, timestamps.monterrey, tenantId, orderId).run();

    const eventNote = stockResult
      ? `${note || `Pedido cambiado a ${status}`}. Stock descontado automaticamente.`
      : (note || `Pedido cambiado a ${status}`);

    await env.DB.prepare(
      `INSERT INTO order_events (tenant_id, order_id, event_type, event_note, created_at_utc, created_at_monterrey)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(tenantId, orderId, status, eventNote, timestamps.utc, timestamps.monterrey).run();

    return jsonResponse({ ok: true, orderId, status, stockResult, updatedAtMonterrey: timestamps.monterrey });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo actualizar el pedido.', detail: error.message }, 500);
  }
}


