import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getPassword(request) {
  return request.headers.get('x-orders-password') || '';
}

// MIGRADO a JWT (ver auditoria-saas-multitenant.md, hallazgo #3/#6): antes
// aceptaba env.ADMIN_PASSWORD / env.ORDERS_PASSWORD, contraseñas globales
// para TODOS los tenants. Ahora exige un usuario admin/orders/platform_admin
// válido para este tenant. El PIN por sucursal (branch.ordersPassword) se
// conserva como segundo factor opcional para acotar la vista a una sola
// sucursal â€” ya estaba correctamente scoped por tenant_id vía
// readBranchSettings(env, tenantId), así que no representa una fuga.
// MIGRADO a JWT (ver auditoria-saas-multitenant.md, hallazgo #3/#6): antes
// aceptaba env.ADMIN_PASSWORD / env.ORDERS_PASSWORD, contraseñas globales
// para TODOS los tenants. Ahora exige un usuario admin/orders/platform_admin
// válido para este tenant. El PIN por sucursal (branch.ordersPassword) se
// conserva como segundo factor opcional para acotar la vista a una sola
// sucursal â€” ya estaba correctamente scoped por tenant_id vía
// readBranchSettings(env, tenantId), así que no representa una fuga.
//
// IMPORTANTE: NO se restauran env.ADMIN_PASSWORD/env.ORDERS_PASSWORD como
// fallback aquí â€” esas eran contraseñas globales compartidas por TODOS los
// tenants del deployment (hallazgo crítico #3). Si un dev las reintroduce
// "por si acaso", vuelve a abrir el cross-tenant hopping.
async function resolveOrdersAccess(request, env, tenantId) {
  const auth = await requireAuth(request, env, ['admin', 'orders', 'platform_admin']);

  if (auth.ok) {
    if (auth.session.role === 'admin' || auth.session.role === 'platform_admin') {
      return { ok: true, role: 'admin', branchFilter: 'all', accessScope: 'all' };
    }
    // JWT válido con rol "orders": igual puede acotarse a una sucursal si
    // manda también el PIN de esa sucursal; si no, ve todas las que aplique
    // a su tenant.
    const password = getPassword(request);
    const branchSettings = await readBranchSettings(env, tenantId);
    const branch = (branchSettings.branches || []).find((item) => item.active !== false && item.ordersPassword && item.ordersPassword === password);
    if (branch) return { ok: true, role: 'orders', branchFilter: branch.id, branch, accessScope: 'branch' };
    return { ok: true, role: 'orders', branchFilter: 'all', accessScope: 'legacy' };
  }

  // Sin JWT: único camino válido es el PIN de sucursal (personal sin cuenta
  // propia), siempre acotado al tenant resuelto por hostname.
  const password = getPassword(request);
  if (!password) return { ok: false, error: 'No autorizado.', response: auth.response };
  const branchSettings = await readBranchSettings(env, tenantId);
  const branch = (branchSettings.branches || []).find((item) => item.active !== false && item.ordersPassword && item.ordersPassword === password);
  if (branch) return { ok: true, role: 'orders', branchFilter: branch.id, branch, accessScope: 'branch' };
  return { ok: false, error: 'No autorizado.', response: auth.response };
}

const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [{ id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' }],
};

function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: String(branch.id || branch.name || `sucursal-${index + 1}`).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sucursal-${index + 1}`,
        name: String(branch.name || branch.id || `Sucursal ${index + 1}`).trim() || `Sucursal ${index + 1}`,
        active: branch.active !== false,
        ordersPassword: String(branch.ordersPassword || branch.orders_password || '').trim(),
        stockPassword: String(branch.stockPassword || branch.stock_password || '').trim(),
        cashierPassword: String(branch.cashierPassword || branch.cashier_password || '').trim(),
        whatsappNumber: String(branch.whatsappNumber || branch.whatsapp_number || branch.whatsapp || '').trim(),
        businessHours: branch.businessHours || branch.business_hours || null,
        soldOut: branch.soldOut || branch.sold_out || {},
      }))
    : DEFAULT_BRANCH_SETTINGS.branches;
  const defaultBranchId = settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId;
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const defaultCashierOrderSource = cashierOrderSources.includes(settings.defaultCashierOrderSource || settings.default_cashier_order_source)
    ? String(settings.defaultCashierOrderSource || settings.default_cashier_order_source).trim()
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, cashierOrderSources, defaultCashierOrderSource, branches };
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


async function ensureStockBranchColumns(env) {
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
  } catch {
    // Stock schema may not be initialized yet. The insert will surface a useful error if needed.
  }
}

async function ensureOrderStockColumns(env) {
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
  for (const sql of alters) await env.DB.prepare(sql).run();
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
  const candidates = recipeKeyCandidates(productId, productName);
  let recipe = null;
  for (const recipeKey of candidates) {
    recipe = await env.DB.prepare(
      `SELECT id FROM stock_recipes WHERE tenant_id = ? AND lower(recipe_key) = lower(?) AND recipe_type = 'product' AND is_active = 1`
    ).bind(tenantId, recipeKey).first();
    if (recipe?.id) break;
  }
  if (!recipe?.id && productName) {
    recipe = await env.DB.prepare(
      `SELECT id FROM stock_recipes WHERE tenant_id = ? AND lower(name) = lower(?) AND recipe_type = 'product' AND is_active = 1 ORDER BY updated_at_utc DESC, id DESC LIMIT 1`
    ).bind(tenantId, String(productName || '').trim()).first();
  }
  if (!recipe?.id) return [];

  const result = await env.DB.prepare(
    `SELECT l.*, i.name AS item_name, i.current_stock, i.deducts_inventory, u.code AS unit_code
     FROM stock_recipe_lines l
     JOIN inventory_items i ON i.id = l.item_id
     LEFT JOIN stock_units u ON u.id = i.unit_id
     WHERE l.tenant_id = ? AND i.tenant_id = ? AND l.recipe_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`
  ).bind(tenantId, tenantId, recipe.id).all();
  return result.results || [];
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
      const result = await env.DB.prepare(
        `SELECT oi.item_id, oi.quantity, i.name AS item_name, i.deducts_inventory, u.code AS unit_code
         FROM stock_product_option_groups pg
         JOIN stock_option_families f ON f.id = pg.family_id
         JOIN stock_option_family_items oi ON oi.family_id = f.id
         JOIN inventory_items i ON i.id = oi.item_id
         LEFT JOIN stock_units u ON u.id = i.unit_id
         WHERE pg.tenant_id = ? AND f.tenant_id = ? AND oi.tenant_id = ? AND i.tenant_id = ? AND pg.product_id = ? AND pg.is_active = 1 AND f.family_key = ? AND lower(oi.option_name) = lower(?) AND oi.is_active = 1
        UNION ALL
        SELECT c.item_id, c.quantity, i.name AS item_name, i.deducts_inventory, u.code AS unit_code
         FROM stock_product_option_groups pg
         JOIN stock_option_families f ON f.id = pg.family_id
         JOIN stock_option_family_items oi ON oi.family_id = f.id
         JOIN stock_option_family_item_components c ON c.option_item_id = oi.id
         JOIN inventory_items i ON i.id = c.item_id
         LEFT JOIN stock_units u ON u.id = i.unit_id
         WHERE pg.tenant_id = ? AND f.tenant_id = ? AND oi.tenant_id = ? AND c.tenant_id = ? AND i.tenant_id = ? AND pg.product_id = ? AND pg.is_active = 1 AND f.family_key = ? AND lower(oi.option_name) = lower(?) AND oi.is_active = 1`
      ).bind(
        tenantId, tenantId, tenantId, tenantId, productId, pair.familyKey, pair.optionName,
        tenantId, tenantId, tenantId, tenantId, tenantId, productId, pair.familyKey, pair.optionName
      ).all();
      rows.push(...(result.results || []));
    } catch { /* components table may not exist before first stock load */ }
  }
  return rows;
}

async function aggregateOrderConsumption(env, orderId, tenantId) {
  const itemsResult = await env.DB.prepare(
    `SELECT * FROM order_items WHERE tenant_id = ? AND order_id = ? ORDER BY id ASC`
  ).bind(tenantId, orderId).all();

  const orderItems = itemsResult.results || [];
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

  for (const orderItem of orderItems) {
    const options = parseOptions(orderItem.options_json);

    if (orderItem.product_id === 'promo' && Array.isArray(options.promoItems)) {
      for (const promoItem of options.promoItems) {
        const productId = promoItem.productId;
        const multiplier = Number(promoItem.quantity || 1) * Number(orderItem.quantity || 1);
        const lines = await getRecipeLinesForProduct(env, productId, promoItem.productName, tenantId);
        if (lines.length === 0) missingRecipes.push(promoItem.productName || productId);
        stats.recipeLineCount += lines.length;
        const promoOptions = options.extrasByProductId?.[productId] || {};
        for (const line of lines) {
          if (shouldUseRecipeLine(line, promoOptions)) {
            stats.matchedLineCount += 1;
            addLine(line, multiplier);
          } else {
            stats.skippedByOptions.push(line.item_name || `Ingrediente ${line.item_id}`);
          }
        }
        const familyComponents = await getSelectedFamilyComponents(env, productId, promoOptions, tenantId);
        stats.recipeLineCount += familyComponents.length;
        for (const component of familyComponents) addLine(component, multiplier);
      }
      continue;
    }

    const productId = orderItem.product_id || orderItem.productId || orderItem.id;
    const lines = await getRecipeLinesForProduct(env, productId, orderItem.product_name, tenantId);
    if (lines.length === 0) missingRecipes.push(orderItem.product_name || productId);
    stats.recipeLineCount += lines.length;
    const multiplier = Number(orderItem.quantity || 1);
    for (const line of lines) {
      if (shouldUseRecipeLine(line, options)) {
        stats.matchedLineCount += 1;
        addLine(line, multiplier);
      } else {
        stats.skippedByOptions.push(line.item_name || `Ingrediente ${line.item_id}`);
      }
    }
    const familyComponents = await getSelectedFamilyComponents(env, productId, options, tenantId);
    stats.recipeLineCount += familyComponents.length;
    for (const component of familyComponents) addLine(component, multiplier);
  }

  return { consumption: [...consumption.values()], missingRecipes, stats };
}


async function ensureBranchStock(env, branchId, tenantId) {
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
  const items = (await env.DB.prepare(`SELECT id, current_stock FROM inventory_items WHERE tenant_id = ?`).bind(tenantId).all()).results || [];
  for (const item of items) {
    const existing = await env.DB.prepare(`SELECT current_stock FROM inventory_branch_stock WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`).bind(tenantId, item.id, branchId).first();
    if (existing) continue;
    const initialStock = count === 0 ? Number(item.current_stock || 0) : 0;
    await env.DB.prepare(`INSERT OR IGNORE INTO inventory_branch_stock (tenant_id, item_id, branch_id, current_stock, updated_at_utc) VALUES (?, ?, ?, ?, ?)`).bind(tenantId, item.id, branchId, initialStock, ts.utc).run();
  }
}

async function getBranchStock(env, itemId, branchId, tenantId) {
  await ensureBranchStock(env, branchId, tenantId);
  const row = await env.DB.prepare(`SELECT current_stock FROM inventory_branch_stock WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`).bind(tenantId, itemId, branchId).first();
  if (row) return Number(row.current_stock || 0);
  const item = await env.DB.prepare(`SELECT current_stock FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(tenantId, itemId).first();
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

  const shortages = [];
  for (const line of consumption) {
    const current = await getBranchStock(env, line.item_id, order.branch_id || 'dominio', tenantId);
    if (current < Number(line.quantity || 0)) {
      shortages.push(`${line.item_name}: tienes ${current} ${line.unit_code || ''}, se necesitan ${line.quantity} ${line.unit_code || ''}`.trim());
    }
  }
  if (shortages.length > 0) {
    throw new Error(`Stock insuficiente. ${shortages.join(' | ')}`);
  }

  const ts = getTimestamps();
  for (const line of consumption) {
    const before = await getBranchStock(env, line.item_id, order.branch_id || 'dominio', tenantId);
    const qty = -Math.abs(Number(line.quantity || 0));
    const after = before + qty;
    await setBranchStock(env, line.item_id, order.branch_id || 'dominio', after, tenantId);
    if ((order.branch_id || 'dominio') === 'dominio') {
      await env.DB.prepare(`UPDATE inventory_items SET current_stock = ?, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(after, ts.utc, tenantId, line.item_id).run();
    } else {
      await env.DB.prepare(`UPDATE inventory_items SET updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(ts.utc, tenantId, line.item_id).run();
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
      'Operación',
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
    SELECT id, order_number, status, customer_name, customer_phone, customer_address, customer_notes,
      subtotal, delivery_fee, total, whatsapp_message, created_at_utc, created_at_monterrey,
      updated_at_utc, updated_at_monterrey, branch_id, branch_name, order_source, cashier_name, cashier_shift, payment_method, payment_status,
      stock_deducted, stock_deducted_at_monterrey, stock_deduction_error
    FROM orders
    WHERE tenant_id = ? AND created_at_monterrey >= ? AND created_at_monterrey < ?`;
  const binds = [tenantId, businessWindow.start, businessWindow.end];
  if (status !== 'all') { ordersQuery += ` AND status = ?`; binds.push(status); }
  if (branchFilter && branchFilter !== 'all') { ordersQuery += ` AND COALESCE(branch_id, 'dominio') = ?`; binds.push(branchFilter); }
  ordersQuery += ` ORDER BY created_at_monterrey DESC LIMIT ?`;
  binds.push(limit);

  const ordersResult = await env.DB.prepare(ordersQuery).bind(...binds).all();
  const orders = ordersResult.results || [];
  const fullOrders = [];

  for (const order of orders) {
    const itemsResult = await env.DB.prepare(
      `SELECT id, product_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes
       FROM order_items WHERE tenant_id = ? AND order_id = ? ORDER BY id ASC`
    ).bind(tenantId, order.id).all();
    const eventsResult = await env.DB.prepare(
      `SELECT id, event_type, event_note, created_at_utc, created_at_monterrey
       FROM order_events WHERE tenant_id = ? AND order_id = ? ORDER BY id ASC`
    ).bind(tenantId, order.id).all();
    fullOrders.push({ ...order, items: itemsResult.results || [], events: eventsResult.results || [] });
  }
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
    const limit = Number(url.searchParams.get('limit') || 100);
    const requestedBranchFilter = url.searchParams.get('branch') || 'all';
    const branchSettings = await readBranchSettings(env, tenantId);
    const branchFilter = access.accessScope === 'branch' ? access.branchFilter : requestedBranchFilter;
    const data = await loadFullOrders(env, status, limit, branchFilter, tenantId);
    return jsonResponse({ ok: true, role: access.role, accessScope: access.accessScope, lockedBranchId: access.accessScope === 'branch' ? access.branchFilter : null, branchSettings: access.role === 'admin' ? branchSettings : hideBranchPasswords(branchSettings), ...data });
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
    const { orderId, status, note = '' } = body;
    const allowedStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!orderId || !allowedStatuses.includes(status)) return jsonResponse({ ok: false, error: 'Estatus inválido.' }, 400);

    const order = await env.DB.prepare(`SELECT id, order_number, status, stock_deducted, branch_id FROM orders WHERE tenant_id = ? AND id = ?`).bind(tenantId, orderId).first();
    if (!order) return jsonResponse({ ok: false, error: 'Pedido no encontrado.' }, 404);
    if (access.accessScope === 'branch' && (order.branch_id || 'dominio') !== access.branchFilter) {
      return jsonResponse({ ok: false, error: 'No puedes modificar pedidos de otra sucursal.' }, 403);
    }

    let stockResult = null;
    if (status === 'ready' && Number(order.stock_deducted || 0) !== 1) {
      try {
        stockResult = await deductOrderStock(env, orderId, order.order_number, tenantId);
      } catch (error) {
        await env.DB.prepare(`UPDATE orders SET stock_deduction_error = ? WHERE tenant_id = ? AND id = ?`).bind(error.message, tenantId, orderId).run();
        return jsonResponse({ ok: false, error: 'No se pudo descontar stock.', detail: error.message }, 400);
      }
    }

    const timestamps = getTimestamps();
    await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
    ).bind(status, timestamps.utc, timestamps.monterrey, tenantId, orderId).run();

    const eventNote = stockResult
      ? `${note || `Pedido cambiado a ${status}`}. Stock descontado automáticamente.`
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

