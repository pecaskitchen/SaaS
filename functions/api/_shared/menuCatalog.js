const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

export const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function slugifyCatalogId(value, fallback = 'item') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

export function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: slugifyCatalogId(branch.id || branch.name, `sucursal-${index + 1}`),
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
  const defaultBranchId = slugifyCatalogId(settings.defaultBranchId || settings.default_branch_id || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId, DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const defaultCashierOrderSource = cashierOrderSources.includes(settings.defaultCashierOrderSource || settings.default_cashier_order_source)
    ? String(settings.defaultCashierOrderSource || settings.default_cashier_order_source).trim()
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return {
    multiBranchEnabled: Boolean(settings.multiBranchEnabled),
    defaultBranchId,
    cashierOrderSources,
    defaultCashierOrderSource,
    branches,
  };
}

export function publicBranchSettings(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return {
    ...normalized,
    branches: normalized.branches.map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch),
  };
}

export function normalizeSavedMenu(raw) {
  try {
    if (!raw) return emptySavedMenu();
    const parsed = JSON.parse(raw);
    if (parsed.overrides || parsed.extraCategories || parsed.extraProducts || parsed.categoryOrder || parsed.productOrder || parsed.categoryHidden || parsed.promotion || parsed.businessHours || parsed.branchSettings) {
      return {
        overrides: parsed.overrides || {},
        extraCategories: Array.isArray(parsed.extraCategories) ? parsed.extraCategories : [],
        extraProducts: Array.isArray(parsed.extraProducts) ? parsed.extraProducts : [],
        categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
        productOrder: Array.isArray(parsed.productOrder) ? parsed.productOrder : [],
        categoryHidden: parsed.categoryHidden || {},
        promotion: parsed.promotion || null,
        branchPromotions: parsed.branchPromotions || {},
        businessHours: parsed.businessHours || null,
        branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS),
        baseCatalogEnabled: Boolean(parsed.baseCatalogEnabled),
      };
    }
    return { ...emptySavedMenu(), overrides: parsed || {} };
  } catch {
    return emptySavedMenu();
  }
}

export function emptySavedMenu() {
  return {
    overrides: {},
    extraCategories: [],
    extraProducts: [],
    categoryOrder: [],
    productOrder: [],
    categoryHidden: {},
    promotion: null,
    branchPromotions: {},
    businessHours: null,
    branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS),
    baseCatalogEnabled: false,
  };
}

// Cacheado a nivel de modulo -- functions/api/menu.js (el endpoint mas
// visitado de toda la app, el menu publico) llama a esto en cada visita
// de cliente. Una vez verificado en este isolate no hace falta repetir
// los CREATE TABLE/INDEX en cada request.
let menuCatalogTablesEnsured = false;

export async function ensureMenuCatalogTables(env) {
  if (!env.DB) return false;
  if (menuCatalogTablesEnsured) return true;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS menu_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    category_key TEXT NOT NULL,
    label TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE(tenant_id, category_key)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS menu_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    product_key TEXT NOT NULL,
    category_key TEXT NOT NULL,
    recipe_id INTEGER,
    item_id INTEGER,
    name TEXT NOT NULL,
    product_type TEXT NOT NULL DEFAULT 'custom',
    price REAL NOT NULL DEFAULT 0,
    badge TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    is_published INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE(tenant_id, product_key)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS menu_product_recipe_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    product_key TEXT NOT NULL,
    recipe_id INTEGER NOT NULL,
    link_type TEXT NOT NULL DEFAULT 'primary',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE(tenant_id, product_key, recipe_id, link_type)
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant_active ON menu_categories(tenant_id, is_active, is_visible, sort_order)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_menu_products_tenant_category ON menu_products(tenant_id, category_key, is_active, is_published, sort_order)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_menu_products_recipe ON menu_products(tenant_id, recipe_id)`).run();
  // Fase 1: item_id es columna nueva -- para instalaciones existentes que
  // crearon menu_products antes de esta columna. Idempotente via try/catch,
  // mismo patron que el resto del backend.
  try {
    await env.DB.prepare(`ALTER TABLE menu_products ADD COLUMN item_id INTEGER`).run();
  } catch {
    // column already exists
  }
  menuCatalogTablesEnsured = true;
  return true;
}

// Unidad base por defecto para el item de un producto -- un producto no
// se compra ni se mide como un ingrediente, pero items.unit_id es NOT
// NULL para todo tipo de item, asi que se usa "pieza" como unidad
// nominal (1 producto = 1 pieza vendida).
const DEFAULT_PRODUCT_UNIT_CODE = 'pieza';

async function defaultProductUnitId(env) {
  const row = await env.DB.prepare(`SELECT id FROM stock_units WHERE code = ?`).bind(DEFAULT_PRODUCT_UNIT_CODE).first();
  return row?.id || null;
}

// Fase 1: asegura que un producto del catalogo tenga su fila espejo en
// `items` (type='product') y que menu_products.item_id apunte a ella --
// el FK real que reemplaza el matching por recipe_key/nombre. Se llama
// tanto desde saveCatalogTables (productos nuevos/editados desde ahora)
// como desde el backfill admin de stock.js (productos que ya existian
// antes de esta migracion). Idempotente: si el producto ya tiene
// item_id, no crea nada nuevo.
export async function ensureProductItemLink(env, tenantId, productKey, productName) {
  const existing = await env.DB.prepare(
    `SELECT item_id FROM menu_products WHERE tenant_id = ? AND product_key = ?`
  ).bind(tenantId, productKey).first();
  if (existing?.item_id) return existing.item_id;

  const unitId = await defaultProductUnitId(env);
  if (!unitId) return null; // stock_units todavia no sembrada para este tenant -- no bloquea el guardado del producto

  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`
    INSERT INTO items (
      tenant_id, name, item_type, type, unit_id, is_active,
      is_sellable, is_purchasable, is_producible, deducts_inventory,
      created_at_utc, updated_at_utc
    ) VALUES (?, ?, 'Producto', 'product', ?, 1, 1, 0, 0, 0, ?, ?)
    RETURNING id
  `).bind(tenantId, productName, unitId, now, now).first();
  const itemId = inserted?.id || null;
  if (itemId) {
    await env.DB.prepare(
      `UPDATE menu_products SET item_id = ? WHERE tenant_id = ? AND product_key = ?`
    ).bind(itemId, tenantId, productKey).run();
  }
  return itemId;
}

function detectMojibake(values) {
  const bad = [];
  for (const value of values) {
    if (/[ÃÂâ]/.test(String(value || ''))) bad.push(String(value));
  }
  return bad;
}

export function cleanPublicOverrides(overrides = {}) {
  const cleaned = { ...(overrides || {}) };
  for (const productId of Object.keys(cleaned)) {
    if (cleaned[productId]?.soldOut !== undefined) {
      const { soldOut: _legacySoldOut, ...rest } = cleaned[productId] || {};
      if (Object.keys(rest).length) cleaned[productId] = rest;
      else delete cleaned[productId];
    }
  }
  return cleaned;
}

export async function readCatalogTables(env, tenantId) {
  await ensureMenuCatalogTables(env);
  const categories = await env.DB.prepare(
    `SELECT category_key, label, emoji, sort_order, is_visible, is_active
     FROM menu_categories
     WHERE tenant_id = ? AND is_active = 1
     ORDER BY sort_order ASC, label ASC`
  ).bind(tenantId).all().then((result) => result.results || []);

  const products = await env.DB.prepare(
    `SELECT p.product_key, p.category_key, p.recipe_id, p.name, p.product_type, p.price, p.badge,
            p.description, p.ingredients, p.image, p.is_published, p.is_active, p.metadata_json, p.sort_order,
            r.recipe_key
     FROM menu_products p
     LEFT JOIN recipes r ON r.tenant_id = p.tenant_id AND r.id = p.recipe_id
     WHERE p.tenant_id = ? AND p.is_active = 1
     ORDER BY p.sort_order ASC, p.name ASC`
  ).bind(tenantId).all().then((result) => result.results || []);

  if (!categories.length && !products.length) return null;

  const categoryItems = categories.map((row) => ({
    id: row.category_key,
    label: row.label,
    emoji: row.emoji || '',
    customCategory: true,
  }));
  const categoryOrder = categories.map((row) => row.category_key);
  const categoryHidden = Object.fromEntries(categories.filter((row) => Number(row.is_visible) === 0).map((row) => [row.category_key, true]));

  const extraProducts = products.map((row) => {
    const metadata = safeJson(row.metadata_json, {});
    return {
      id: row.product_key,
      name: row.name,
      category: row.category_key,
      type: row.product_type || 'custom',
      price: Number(row.price || 0),
      badge: row.badge || '',
      description: row.description || '',
      ingredients: row.ingredients || '',
      image: row.image || '',
      unavailable: Number(row.is_published) === 0,
      recipeId: row.recipe_id || null,
      recipeKey: row.recipe_key || metadata.recipeKey || '',
      customProduct: true,
    };
  });

  return {
    ...emptySavedMenu(),
    extraCategories: categoryItems,
    extraProducts,
    categoryOrder,
    productOrder: products.map((row) => row.product_key),
    categoryHidden,
    catalogSource: 'tables',
  };
}

export async function saveCatalogTables(env, tenantId, payload) {
  await ensureMenuCatalogTables(env);
  const now = new Date().toISOString();
  const inputCategories = Array.isArray(payload.extraCategories) ? payload.extraCategories : [];
  const inputProducts = Array.isArray(payload.extraProducts) ? payload.extraProducts : [];
  const categoryOrder = Array.isArray(payload.categoryOrder) ? payload.categoryOrder : [];
  const productOrder = Array.isArray(payload.productOrder) ? payload.productOrder : [];
  const hidden = payload.categoryHidden || {};

  const categories = inputCategories.map((category, index) => {
    const id = slugifyCatalogId(category.id || category.label, `categoria-${index + 1}`);
    return {
      id,
      label: String(category.label || category.name || id).trim() || id,
      emoji: String(category.emoji || '').trim(),
      description: String(category.description || '').trim(),
      sortOrder: categoryOrder.includes(id) ? categoryOrder.indexOf(id) : index,
      visible: !hidden[id],
    };
  }).filter((category) => category.id);

  const categoryKeys = new Set(categories.map((category) => category.id));
  const activeProductKeys = new Set();
  const validationErrors = [];
  const mojibake = [];

  for (const category of categories) {
    mojibake.push(...detectMojibake([category.label, category.description]));
    await env.DB.prepare(
      `INSERT INTO menu_categories (tenant_id, category_key, label, emoji, description, sort_order, is_visible, is_active, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(tenant_id, category_key) DO UPDATE SET
         label = excluded.label,
         emoji = excluded.emoji,
         description = excluded.description,
         sort_order = excluded.sort_order,
         is_visible = excluded.is_visible,
         is_active = 1,
         updated_at_utc = excluded.updated_at_utc`
    ).bind(tenantId, category.id, category.label, category.emoji, category.description, category.sortOrder, category.visible ? 1 : 0, now, now).run();
  }

  for (let index = 0; index < inputProducts.length; index += 1) {
    const product = inputProducts[index] || {};
    const productKey = slugifyCatalogId(product.id || product.name, `producto-${index + 1}`);
    const categoryKey = slugifyCatalogId(product.category, '');
    const name = String(product.name || '').trim();
    if (!name) validationErrors.push(`Producto ${productKey}: falta nombre.`);
    if (!categoryKey || !categoryKeys.has(categoryKey)) validationErrors.push(`${name || productKey}: selecciona una categoria existente.`);
    if (product.unavailable !== true && Number(product.price || 0) < 0) validationErrors.push(`${name || productKey}: precio invalido.`);
    if (!name || !categoryKey || !categoryKeys.has(categoryKey)) continue;
    activeProductKeys.add(productKey);
    mojibake.push(...detectMojibake([name, product.description, product.ingredients, product.badge]));
    const recipeKey = String(product.recipeKey || `product:${productKey}`).trim();
    const recipe = await env.DB.prepare(`SELECT id, recipe_key FROM recipes WHERE tenant_id = ? AND (id = ? OR recipe_key = ?) LIMIT 1`)
      .bind(tenantId, Number(product.recipeId || 0), recipeKey)
      .first()
      .catch(() => null);
    const metadata = JSON.stringify({ recipeKey: recipe?.recipe_key || recipeKey });
    const sortOrder = productOrder.includes(productKey) ? productOrder.indexOf(productKey) : index;
    await env.DB.prepare(
      `INSERT INTO menu_products (tenant_id, product_key, category_key, recipe_id, name, product_type, price, badge, description, ingredients, image, is_published, is_active, metadata_json, sort_order, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, product_key) DO UPDATE SET
         category_key = excluded.category_key,
         recipe_id = excluded.recipe_id,
         name = excluded.name,
         product_type = excluded.product_type,
         price = excluded.price,
         badge = excluded.badge,
         description = excluded.description,
         ingredients = excluded.ingredients,
         image = excluded.image,
         is_published = excluded.is_published,
         is_active = 1,
         metadata_json = excluded.metadata_json,
         sort_order = excluded.sort_order,
         updated_at_utc = excluded.updated_at_utc`
    ).bind(
      tenantId,
      productKey,
      categoryKey,
      recipe?.id || null,
      name,
      String(product.type || 'custom').trim() || 'custom',
      Number(product.price || 0),
      String(product.badge || '').trim(),
      String(product.description || '').trim(),
      String(product.ingredients || '').trim(),
      String(product.image || '').trim(),
      product.unavailable ? 0 : 1,
      metadata,
      sortOrder,
      now,
      now,
    ).run();

    if (recipe?.id) {
      await env.DB.prepare(
        `INSERT INTO menu_product_recipe_links (tenant_id, product_key, recipe_id, link_type, is_active, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, 'primary', 1, ?, ?)
         ON CONFLICT(tenant_id, product_key, recipe_id, link_type) DO UPDATE SET is_active = 1, updated_at_utc = excluded.updated_at_utc`
      ).bind(tenantId, productKey, recipe.id, now, now).run();

      // Fase 1: enlaza recipes.item_id (FK real) cada vez que se guarda un
      // producto con receta -- asi los productos nuevos/editados de aqui en
      // adelante nunca necesitan el fallback por recipe_key/nombre en
      // orders-dashboard.js. WHERE item_id IS NULL evita pisar un link ya
      // resuelto.
      const itemId = await ensureProductItemLink(env, tenantId, productKey, name);
      if (itemId) {
        await env.DB.prepare(
          `UPDATE recipes SET item_id = ? WHERE tenant_id = ? AND id = ? AND item_id IS NULL`
        ).bind(itemId, tenantId, recipe.id).run();
      }
    } else {
      await ensureProductItemLink(env, tenantId, productKey, name);
    }
  }

  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '));
    error.validationErrors = validationErrors;
    throw error;
  }

  const obsoleteProducts = await env.DB.prepare(`SELECT product_key FROM menu_products WHERE tenant_id = ? AND is_active = 1`).bind(tenantId).all().then((result) => result.results || []);
  for (const row of obsoleteProducts) {
    if (!activeProductKeys.has(row.product_key)) {
      await env.DB.prepare(`UPDATE menu_products SET is_active = 0, updated_at_utc = ? WHERE tenant_id = ? AND product_key = ?`).bind(now, tenantId, row.product_key).run();
    }
  }

  const obsoleteCategories = await env.DB.prepare(`SELECT category_key FROM menu_categories WHERE tenant_id = ? AND is_active = 1`).bind(tenantId).all().then((result) => result.results || []);
  for (const row of obsoleteCategories) {
    if (!categoryKeys.has(row.category_key)) {
      await env.DB.prepare(`UPDATE menu_categories SET is_active = 0, updated_at_utc = ? WHERE tenant_id = ? AND category_key = ?`).bind(now, tenantId, row.category_key).run();
    }
  }

  return { mojibakeWarnings: [...new Set(mojibake)] };
}

export async function recipeCatalogFromStock(env, tenantId, saved, overrides = saved.overrides || {}) {
  const products = Array.isArray(saved.extraProducts) ? [...saved.extraProducts] : [];
  const categories = Array.isArray(saved.extraCategories) ? [...saved.extraCategories] : [];
  const seenProducts = new Set(products.map((product) => String(product?.id || '').trim()).filter(Boolean));
  const seenCategories = new Set(categories.map((category) => String(category?.id || '').trim()).filter(Boolean));

  const rows = await env.DB.prepare(
    `SELECT r.recipe_key, r.name
     FROM recipes r
     WHERE r.tenant_id = ?
       AND r.recipe_type = 'product'
       AND r.is_active = 1
     ORDER BY r.name ASC`
  ).bind(tenantId).all().then((result) => result.results || []).catch(() => []);

  for (const row of rows) {
    const productId = String(row.recipe_key || '').replace(/^product:/, '').trim() || slugifyCatalogId(row.name, 'producto');
    if (seenProducts.has(productId)) continue;
    const override = overrides[productId] || {};
    const fallbackCategory = Array.isArray(saved.categoryOrder) && saved.categoryOrder[0] ? saved.categoryOrder[0] : 'sin-categoria';
    const categoryId = slugifyCatalogId(override.category || fallbackCategory, 'sin-categoria');
    products.push({
      id: productId,
      name: override.name || row.name || productId,
      category: categoryId,
      type: 'custom',
      price: Number(override.price || 0),
      badge: override.badge || '',
      description: override.description || '',
      ingredients: override.ingredients || '',
      image: override.image || '',
      unavailable: Boolean(override.unavailable),
      customProduct: true,
    });
    seenProducts.add(productId);
    if (!seenCategories.has(categoryId)) {
      categories.push({ id: categoryId, label: String(categoryId || 'Sin categoria'), emoji: '', customCategory: true });
      seenCategories.add(categoryId);
    }
  }

  return { ...saved, extraProducts: products, extraCategories: categories, catalogSource: saved.catalogSource || 'legacy' };
}

export async function readEffectiveCatalog(env, tenantId, legacySaved, options = {}) {
  const tableCatalog = await readCatalogTables(env, tenantId).catch(() => null);
  if (tableCatalog && (tableCatalog.extraCategories.length || tableCatalog.extraProducts.length)) {
    return {
      ...legacySaved,
      ...tableCatalog,
      promotion: legacySaved.promotion || null,
      branchPromotions: legacySaved.branchPromotions || {},
      businessHours: legacySaved.businessHours || null,
      branchSettings: legacySaved.branchSettings || normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS),
      baseCatalogEnabled: false,
    };
  }
  if (options.includeRecipeFallback !== false) {
    return recipeCatalogFromStock(env, tenantId, legacySaved, options.overrides || legacySaved.overrides || {});
  }
  return { ...legacySaved, catalogSource: 'legacy' };
}
