import { defaultTenantId, ensureTenantColumns, normalizeTenantId, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getTimestamps() {
  const now = new Date();
  const monterrey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return { utc: now.toISOString(), monterrey };
}



const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

function normalizeBranchId(value, fallback = 'dominio') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: normalizeBranchId(branch.id || branch.name, `sucursal-${index + 1}`),
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
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, branches };
}


function hideBranchPasswords(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return {
    ...normalized,
    branches: (normalized.branches || []).map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch),
  };
}

function activeBranches(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return normalized.branches.filter((branch) => branch.active !== false);
}

function selectedBranchFrom(settings, branchId) {
  const normalized = normalizeBranchSettings(settings);
  const available = activeBranches(normalized);
  return available.find((branch) => branch.id === branchId)
    || available.find((branch) => branch.id === normalized.defaultBranchId)
    || available[0]
    || normalized.branches[0]
    || DEFAULT_BRANCH_SETTINGS.branches[0];
}

function safeDecodeHeader(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

// MIGRADO a JWT (ver auditoria-saas-multitenant.md, hallazgo #3/#6): antes
// aceptaba env.ADMIN_PASSWORD / env.KITCHEN_PASSWORD, contrase?as globales
// para TODOS los tenants. Ahora exige un usuario admin/kitchen/platform_admin
// v?lido para este tenant (env.__tenantId debe estar fijado ANTES de llamar
// esta funci?n - ver correcci?n de orden en onRequestPost m?s abajo). El PIN
// por sucursal (branch.stockPassword) se conserva como segundo factor
// opcional para acotar la vista a una sola sucursal; ya estaba scoped por
// tenant_id v?a readMenuSettings(env), as? que no representa una fuga.
async function authFromValues(values, env, request = null) {
  const name = String(values?.operatorName || values?.name || '').trim();
  const shift = String(values?.shift || '').trim() || 'Sin turno';
  const password = String(values?.password || '').trim();

  if (!name) return { ok: false, error: 'Ingresa el nombre de quien opera.' };

  if (request) {
    const jwtAuth = await requireAuth(request, env, ['admin', 'kitchen', 'platform_admin']);
    if (jwtAuth.ok) {
      const role = jwtAuth.session.role === 'platform_admin' ? 'admin' : jwtAuth.session.role;
      return { ok: true, role, name, shift, accessScope: role === 'admin' ? 'all' : 'legacy' };
    }
  }

  // IMPORTANTE: no reintroducir env.ADMIN_PASSWORD/env.KITCHEN_PASSWORD como
  // fallback aqu? - eran contrase?as globales compartidas por TODOS los
  // tenants (hallazgo cr?tico #3). El ?nico fallback v?lido sin JWT es el
  // PIN por sucursal de abajo, que ya est? scoped por tenant_id.
  try {
    const settings = await readMenuSettings(env);
    const branchSettings = normalizeBranchSettings(settings.branchSettings || DEFAULT_BRANCH_SETTINGS);
    const branch = (branchSettings.branches || []).find((item) => item.active !== false && item.stockPassword && item.stockPassword === password);
    if (branch) return { ok: true, role: 'kitchen', name, shift, accessScope: 'branch', lockedBranchId: branch.id, lockedBranchName: branch.name };
  } catch {
    // If menu settings are not initialized yet, fall through to invalid password.
  }
  return { ok: false, error: 'Sesi?n inv?lida o contrase?a de sucursal incorrecta.' };
}

async function auth(request, env) {
  return authFromValues({
    password: safeDecodeHeader(request.headers.get('x-stock-password') || ''),
    operatorName: safeDecodeHeader(request.headers.get('x-stock-name') || ''),
    shift: safeDecodeHeader(request.headers.get('x-stock-shift') || ''),
  }, env, request);
}

function requireAdmin(user) {
  return user.role === 'admin';
}

async function ensureSchema(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS stock_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'general',
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS stock_purchase_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS stock_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS stock_branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      brand TEXT,
      item_type TEXT NOT NULL DEFAULT 'Ingrediente comprado',
      unit_id INTEGER NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      max_stock REAL NOT NULL DEFAULT 0,
      accuracy_target REAL NOT NULL DEFAULT 85,
      primary_supplier_id INTEGER,
      alt_supplier_id INTEGER,
      purchase_category_id INTEGER,
      purchase_unit_label TEXT,
      purchase_unit_quantity REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      expiry_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      client_visible INTEGER NOT NULL DEFAULT 0,
      client_removable INTEGER NOT NULL DEFAULT 0,
      client_changeable INTEGER NOT NULL DEFAULT 0,
      deducts_inventory INTEGER NOT NULL DEFAULT 1,
      is_packaging INTEGER NOT NULL DEFAULT 0,
      is_internal_dressing INTEGER NOT NULL DEFAULT 0,
      is_side_dressing INTEGER NOT NULL DEFAULT 0,
      is_sellable_extra INTEGER NOT NULL DEFAULT 0,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      FOREIGN KEY (unit_id) REFERENCES stock_units(id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_branch_stock (
      tenant_id TEXT NOT NULL DEFAULT 'default',
      item_id INTEGER NOT NULL,
      branch_id TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      updated_at_utc TEXT NOT NULL,
      PRIMARY KEY (item_id, branch_id),
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      stock_before REAL NOT NULL,
      stock_after REAL NOT NULL,
      reason TEXT,
      source_type TEXT,
      source_id TEXT,
      reported_by TEXT,
      reported_role TEXT,
      reported_shift TEXT,
      approved_by TEXT,
      branch_id TEXT NOT NULL DEFAULT 'dominio',
      branch_name TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS waste_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reported_by TEXT NOT NULL,
      reported_role TEXT NOT NULL,
      reported_shift TEXT NOT NULL,
      approved_by TEXT,
      branch_id TEXT NOT NULL DEFAULT 'dominio',
      branch_name TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      updated_at_monterrey TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_count_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      item_id INTEGER NOT NULL,
      requested_stock REAL NOT NULL,
      current_stock_snapshot REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reported_by TEXT NOT NULL,
      reported_role TEXT NOT NULL,
      reported_shift TEXT NOT NULL,
      approved_by TEXT,
      branch_id TEXT NOT NULL DEFAULT 'dominio',
      branch_name TEXT,
      created_at_utc TEXT NOT NULL,
      created_at_monterrey TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      updated_at_monterrey TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      recipe_key TEXT NOT NULL,
      recipe_type TEXT NOT NULL DEFAULT 'product',
      name TEXT NOT NULL,
      output_item_id INTEGER,
      output_quantity REAL NOT NULL DEFAULT 0,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      FOREIGN KEY (output_item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_recipe_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      recipe_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      line_role TEXT NOT NULL DEFAULT 'ingrediente',
      client_visible INTEGER NOT NULL DEFAULT 0,
      client_removable INTEGER NOT NULL DEFAULT 0,
      client_changeable INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_optional INTEGER NOT NULL DEFAULT 0,
      is_extra_billable INTEGER NOT NULL DEFAULT 0,
      extra_price REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (recipe_id) REFERENCES stock_recipes(id),
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_option_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      family_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS stock_option_family_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      family_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      option_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      extra_price REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      UNIQUE(family_id, option_name),
      FOREIGN KEY (family_id) REFERENCES stock_option_families(id),
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_option_family_item_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      option_item_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      UNIQUE(option_item_id, item_id),
      FOREIGN KEY (option_item_id) REFERENCES stock_option_family_items(id),
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_product_option_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      product_id TEXT NOT NULL,
      family_id INTEGER NOT NULL,
      label TEXT,
      min_select INTEGER NOT NULL DEFAULT 0,
      max_included INTEGER NOT NULL DEFAULT 0,
      max_total INTEGER NOT NULL DEFAULT 1,
      default_option_name TEXT,
      extra_price REAL NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      UNIQUE(product_id, family_id),
      FOREIGN KEY (family_id) REFERENCES stock_option_families(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_stock_recipes_type ON stock_recipes(recipe_type, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_recipes_tenant_type ON stock_recipes(tenant_id, recipe_type, is_active)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_recipes_tenant_key ON stock_recipes(tenant_id, recipe_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_option_families_tenant_key ON stock_option_families(tenant_id, family_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_items_tenant_name ON inventory_items(tenant_id, name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_purchase_categories_tenant_name ON stock_purchase_categories(tenant_id, name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_suppliers_tenant_name ON stock_suppliers(tenant_id, name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_option_family_items_tenant_family_name ON stock_option_family_items(tenant_id, family_id, option_name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_product_option_groups_tenant_product_family ON stock_product_option_groups(tenant_id, product_id, family_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_recipe_lines_recipe ON stock_recipe_lines(recipe_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_option_families_key ON stock_option_families(family_key)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_option_family_items_family ON stock_option_family_items(family_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_option_components_option ON stock_option_family_item_components(option_item_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_product_option_groups_product ON stock_product_option_groups(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_active ON inventory_items(tenant_id, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id, created_at_utc)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id, created_at_utc)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_branch ON stock_movements(tenant_id, branch_id, created_at_utc)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_branch_stock_branch ON inventory_branch_stock(branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_branch_stock_tenant_branch ON inventory_branch_stock(tenant_id, branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_waste_requests_status ON waste_requests(status, created_at_utc)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_count_requests_status ON inventory_count_requests(status, created_at_utc)`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }

  await ensureTenantColumns(env, [
    'app_settings',
    'stock_units',
    'stock_purchase_categories',
    'stock_suppliers',
    'stock_branches',
    'inventory_items',
    'inventory_branch_stock',
    'stock_movements',
    'waste_requests',
    'inventory_count_requests',
    'stock_recipes',
    'stock_recipe_lines',
    'stock_option_families',
    'stock_option_family_items',
    'stock_option_family_item_components',
    'stock_product_option_groups',
  ]);

  const migrations = [
    `ALTER TABLE stock_recipe_lines ADD COLUMN is_optional INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE stock_recipe_lines ADD COLUMN is_extra_billable INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE stock_recipe_lines ADD COLUMN extra_price REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE stock_movements ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`,
    `ALTER TABLE stock_movements ADD COLUMN branch_name TEXT`,
    `ALTER TABLE waste_requests ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`,
    `ALTER TABLE waste_requests ADD COLUMN branch_name TEXT`,
    `ALTER TABLE inventory_count_requests ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`,
    `ALTER TABLE inventory_count_requests ADD COLUMN branch_name TEXT`,
  ];

  for (const sql of migrations) {
    try {
      await env.DB.prepare(sql).run();
    } catch {
      // column already exists
    }
  }
}

async function getLookupId(env, table, column, value) {
  if (table === 'stock_units') {
    const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).bind(value).first();
    return row?.id || null;
  }
  const tenantId = currentTenantId(env);
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE tenant_id = ? AND ${column} = ?`).bind(tenantId, value).first();
  return row?.id || null;
}

async function ensureLookupDefaults(env) {
  const tenantId = currentTenantId(env);
  const units = [
    ['pieza', 'Pieza', 'count', 1],
    ['g', 'Gramo', 'weight', 2],
    ['kg', 'Kilogramo', 'weight', 3],
    ['ml', 'Mililitro', 'volume', 4],
    ['l', 'Litro', 'volume', 5],
    ['bolsa', 'Bolsa', 'count', 6],
    ['paquete', 'Paquete', 'count', 7],
    ['caja', 'Caja', 'count', 8],
    ['porcion', 'Porcion', 'count', 9],
  ];
  for (const unit of units) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_units (code, name, kind, sort_order) VALUES (?, ?, ?, ?)`
    ).bind(...unit).run();
  }

  const categories = ['Pan', 'Refrigerados', 'Verduras', 'Fruta', 'Condimentos y aderezos', 'Cafe y bebidas', 'Empaque', 'Limpieza / otros'];
  for (let index = 0; index < categories.length; index += 1) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_purchase_categories (tenant_id, name, sort_order) VALUES (?, ?, ?)`
    ).bind(tenantId, categories[index], index + 1).run();
  }

  const suppliers = ['Costco', 'Sams', 'HEB', 'Proveedor local', 'Empaques'];
  for (const supplier of suppliers) {
    await env.DB.prepare(`INSERT OR IGNORE INTO stock_suppliers (tenant_id, name) VALUES (?, ?)`).bind(tenantId, supplier).run();
  }
}

async function seedDefaults(env) {
  await ensureLookupDefaults(env);
  const tenantId = currentTenantId(env);
  const units = [
    ['pieza', 'Pieza', 'count', 1],
    ['g', 'Gramo', 'weight', 2],
    ['kg', 'Kilogramo', 'weight', 3],
    ['ml', 'Mililitro', 'volume', 4],
    ['l', 'Litro', 'volume', 5],
    ['bolsa', 'Bolsa', 'count', 6],
    ['paquete', 'Paquete', 'count', 7],
    ['caja', 'Caja', 'count', 8],
    ['porcion', 'Porci?n', 'count', 9],
  ];
  for (const unit of units) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_units (code, name, kind, sort_order) VALUES (?, ?, ?, ?)`
    ).bind(...unit).run();
  }

  const categories = ['Pan', 'Refrigerados', 'Verduras', 'Fruta', 'Condimentos y aderezos', 'Café y bebidas', 'Empaque', 'Limpieza / otros'];
  for (let index = 0; index < categories.length; index += 1) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO stock_purchase_categories (tenant_id, name, sort_order) VALUES (?, ?, ?)`
    ).bind(tenantId, categories[index], index + 1).run();
  }

  const suppliers = ['Costco', "Sam's", 'HEB', 'Proveedor local', 'Empaques'];
  for (const supplier of suppliers) {
    await env.DB.prepare(`INSERT OR IGNORE INTO stock_suppliers (tenant_id, name) VALUES (?, ?)`).bind(tenantId, supplier).run();
  }

  const piece = await getLookupId(env, 'stock_units', 'code', 'pieza');
  const grams = await getLookupId(env, 'stock_units', 'code', 'g');
  const ml = await getLookupId(env, 'stock_units', 'code', 'ml');
  const bag = await getLookupId(env, 'stock_units', 'code', 'bolsa');
  const pan = await getLookupId(env, 'stock_purchase_categories', 'name', 'Pan');
  const refr = await getLookupId(env, 'stock_purchase_categories', 'name', 'Refrigerados');
  const fruta = await getLookupId(env, 'stock_purchase_categories', 'name', 'Fruta');
  const verd = await getLookupId(env, 'stock_purchase_categories', 'name', 'Verduras');
  const cond = await getLookupId(env, 'stock_purchase_categories', 'name', 'Condimentos y aderezos');
  const cafe = await getLookupId(env, 'stock_purchase_categories', 'name', 'Café y bebidas');
  const emp = await getLookupId(env, 'stock_purchase_categories', 'name', 'Empaque');
  const costco = await getLookupId(env, 'stock_suppliers', 'name', 'Costco');
  const heb = await getLookupId(env, 'stock_suppliers', 'name', 'HEB');
  const sams = await getLookupId(env, 'stock_suppliers', 'name', "Sam's");
  const empaques = await getLookupId(env, 'stock_suppliers', 'name', 'Empaques');
  const now = new Date().toISOString();

  const defaults = [
    ['Pan chapata', '', 'Ingrediente comprado', piece, 0, 10, 50, 95, costco, heb, pan, 'bolsa 12 piezas', 12, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Tortilla wrap', '', 'Ingrediente comprado', piece, 0, 10, 40, 95, costco, heb, pan, 'paquete', 10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Masa crepa', '', 'Ingrediente comprado', grams, 0, 500, 2500, 85, heb, costco, refr, 'mezcla preparada', 1000, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Jamón de pavo', '', 'Ingrediente comprado', grams, 0, 300, 1500, 85, costco, heb, refr, 'paquete', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Pepperoni', '', 'Ingrediente comprado', grams, 0, 300, 1500, 85, costco, heb, refr, 'paquete', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Queso manchego', '', 'Ingrediente comprado', grams, 0, 300, 2000, 85, costco, heb, refr, 'paquete 1 kg', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Queso mozzarella', '', 'Ingrediente comprado', grams, 0, 300, 2000, 85, costco, heb, refr, 'paquete 1 kg', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Mix quesos', '', 'Ingrediente comprado', grams, 0, 300, 2000, 85, costco, heb, refr, 'paquete 1 kg', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Pollo', '', 'Ingrediente comprado', grams, 0, 500, 3000, 80, costco, heb, refr, 'paquete', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    ['Lechuga', '', 'Ingrediente comprado', grams, 0, 300, 1500, 75, heb, costco, verd, 'pieza/bolsa', 500, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    ['Fresa', '', 'Ingrediente comprado', grams, 0, 300, 1500, 75, heb, costco, fruta, 'paquete', 450, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Plátano', '', 'Ingrediente comprado', grams, 0, 300, 1500, 75, heb, costco, fruta, 'kg aprox', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Nuez', '', 'Ingrediente comprado', grams, 0, 200, 1000, 85, costco, heb, cond, 'bolsa', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Nutella', 'Nutella', 'Ingrediente comprado', grams, 0, 500, 3000, 85, costco, heb, cond, 'frasco', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Cajeta', '', 'Ingrediente comprado', grams, 0, 300, 2000, 85, heb, costco, cond, 'frasco', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Lechera', '', 'Ingrediente comprado', grams, 0, 300, 2000, 85, costco, heb, cond, 'lata/botella', 1000, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    ['Leche entera', '', 'Ingrediente comprado', ml, 0, 1000, 6000, 95, heb, costco, cafe, 'litro', 1000, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0],
    ['Leche deslactosada', '', 'Ingrediente comprado', ml, 0, 1000, 6000, 95, heb, costco, cafe, 'litro', 1000, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0],
    ['Café', '', 'Ingrediente comprado', grams, 0, 500, 2000, 95, costco, heb, cafe, 'bolsa', 1000, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Hielo en bolsa', '', 'Hielo', bag, 0, 1, 5, 65, heb, costco, cafe, 'bolsa', 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Mayonesa', 'McCormick', 'Ingrediente comprado', grams, 0, 500, 4000, 80, sams, costco, cond, 'cubeta', 3400, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Chipotle', '', 'Ingrediente comprado', grams, 0, 200, 1500, 80, heb, costco, cond, 'lata', 200, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Mostaza', '', 'Ingrediente comprado', grams, 0, 200, 1000, 80, heb, costco, cond, 'botella', 500, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Catsup', '', 'Ingrediente comprado', grams, 0, 200, 1000, 80, heb, costco, cond, 'botella', 1000, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    ['Aderezo chipotle preparado', 'Pecas', 'Sub-receta / preparado', ml, 0, 300, 1500, 80, null, null, cond, 'preparado interno', 1000, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1],
    ['Blue cheese de la casa', 'Pecas', 'Sub-receta / preparado', ml, 0, 300, 1500, 80, null, null, cond, 'preparado interno', 1000, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1],
    ['Contenedor crepa', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 50 piezas', 50, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Bolsa panini', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 50 piezas', 50, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Aluminio / papel', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'rollo/paquete', 100, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Sticker', '', 'Empaque', piece, 0, 30, 200, 92, empaques, costco, emp, 'paquete 100 piezas', 100, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Vaso café', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 50 piezas', 50, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Tapa café', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 50 piezas', 50, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Popote', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 100 piezas', 100, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Servilleta', '', 'Empaque', piece, 0, 50, 300, 92, empaques, costco, emp, 'paquete', 100, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
    ['Cubiertos', '', 'Empaque', piece, 0, 20, 100, 92, empaques, costco, emp, 'paquete 50 piezas', 50, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0],
  ];

  for (const item of defaults) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inventory_items (
        name, brand, item_type, unit_id, current_stock, min_stock, max_stock, accuracy_target,
        primary_supplier_id, alt_supplier_id, purchase_category_id, purchase_unit_label,
        purchase_unit_quantity, purchase_price, is_active, client_visible, client_removable,
        client_changeable, deducts_inventory, is_packaging, is_internal_dressing,
        is_side_dressing, is_sellable_extra, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...item, now, now).run();
  }
}


function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
    const parsed = JSON.parse(raw);
    if (parsed.overrides || parsed.extraCategories || parsed.extraProducts || parsed.categoryOrder || parsed.productOrder || parsed.categoryHidden || parsed.promotion || parsed.businessHours || parsed.branchSettings) {
      return {
        overrides: parsed.overrides || {},
        extraCategories: Array.isArray(parsed.extraCategories) ? parsed.extraCategories : [],
        extraProducts: Array.isArray(parsed.extraProducts) ? parsed.extraProducts : [],
        categoryOrder: parsed.categoryOrder || [],
        productOrder: parsed.productOrder || [],
        categoryHidden: parsed.categoryHidden || {},
        promotion: parsed.promotion || null,
        businessHours: parsed.businessHours || null,
        branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS),
      };
    }
    return { overrides: parsed || {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { overrides: {}, extraCategories: [], extraProducts: [], categoryOrder: [], productOrder: [], categoryHidden: {}, promotion: null, businessHours: null, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

function currentTenantId(env) {
  return normalizeTenantId(env.__tenantId || defaultTenantId(env), env);
}

async function readMenuSettings(env, tenantId = currentTenantId(env)) {
  const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
  const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
  return normalizeSavedMenu(row?.value_json || '');
}

async function writeMenuSettings(env, settings, tenantId = currentTenantId(env)) {
  const now = new Date().toISOString();
  const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
  await env.DB.prepare(
    `INSERT INTO app_settings (key, tenant_id, value_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET tenant_id = excluded.tenant_id, value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).bind(settingKey, tenantId, JSON.stringify(settings), now).run();
}

function slugifyCatalogId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `producto-${Date.now()}`;
}

async function saveCatalogProduct(env, product) {
  const settings = await readMenuSettings(env);
  const name = String(product.name || '').trim();
  if (!name) throw new Error('El producto necesita nombre.');
  const id = slugifyCatalogId(product.id || name);
  const category = slugifyCatalogId(product.category || 'sin-categoria');
  const nextProduct = {
    id,
    category,
    name,
    description: String(product.description || '').trim(),
    price: Number(product.price || 0),
    emoji: String(product.emoji || product.icon || '').trim() || '',
  };
  const extraCategories = Array.isArray(settings.extraCategories) ? [...settings.extraCategories] : [];
  if (!extraCategories.some((item) => item.id === category)) {
    extraCategories.push({ id: category, label: String(product.categoryLabel || product.category || 'Sin categoria').trim() || 'Sin categoria', emoji: '' });
  }
  const baseProducts = Array.isArray(settings.extraProducts) ? settings.extraProducts : [];
  const extraProducts = [
    ...baseProducts.filter((item) => item.id !== id),
    nextProduct,
  ];
  const productOrder = Array.isArray(settings.productOrder) && settings.productOrder.includes(id)
    ? settings.productOrder
    : [...(settings.productOrder || []), id];
  await writeMenuSettings(env, { ...settings, extraCategories, extraProducts, productOrder });
  return nextProduct;
}

async function archiveRecipe(env, recipeId, archived = true) {
  const tenantId = currentTenantId(env);
  const id = Number(recipeId || 0);
  if (!id) throw new Error('Falta receta.');
  await env.DB.prepare(`UPDATE stock_recipes SET is_active = ?, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(archived ? 0 : 1, new Date().toISOString(), tenantId, id).run();
}


async function syncBranchesFromSettings(env) {
  const tenantId = currentTenantId(env);
  const settings = await readMenuSettings(env);
  const branchSettings = normalizeBranchSettings(settings.branchSettings || DEFAULT_BRANCH_SETTINGS);
  const ts = getTimestamps();
  for (const branch of branchSettings.branches) {
    const rowId = `${tenantId}:${branch.id}`;
    await env.DB.prepare(
      `INSERT INTO stock_branches (id, tenant_id, name, active, is_default, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET tenant_id = excluded.tenant_id, name = excluded.name, active = excluded.active, is_default = excluded.is_default, updated_at_utc = excluded.updated_at_utc`
    ).bind(rowId, tenantId, branch.name, branch.active !== false ? 1 : 0, branch.id === branchSettings.defaultBranchId ? 1 : 0, ts.utc, ts.utc).run();
  }
  return branchSettings;
}

async function resolveBranch(env, requestedBranchId) {
  const branchSettings = await syncBranchesFromSettings(env);
  const branch = selectedBranchFrom(branchSettings, normalizeBranchId(requestedBranchId || branchSettings.defaultBranchId));
  return { branchSettings, branchId: branch.id, branchName: branch.name };
}

async function ensureBranchStock(env, branchId) {
  const tenantId = currentTenantId(env);
  const ts = getTimestamps();
  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM inventory_branch_stock WHERE tenant_id = ? AND branch_id = ?`).bind(tenantId, branchId).first();
  const count = Number(countRow?.count || 0);
  const items = (await env.DB.prepare(`SELECT id, current_stock FROM inventory_items WHERE tenant_id = ?`).bind(tenantId).all()).results || [];
  for (const item of items) {
    const existing = await env.DB.prepare(`SELECT current_stock FROM inventory_branch_stock WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`).bind(tenantId, item.id, branchId).first();
    if (existing) continue;
    const initialStock = count === 0 ? Number(item.current_stock || 0) : 0;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inventory_branch_stock (tenant_id, item_id, branch_id, current_stock, updated_at_utc) VALUES (?, ?, ?, ?, ?)`
    ).bind(tenantId, item.id, branchId, initialStock, ts.utc).run();
  }
}

async function getBranchStock(env, itemId, branchId) {
  const tenantId = currentTenantId(env);
  await ensureBranchStock(env, branchId);
  const row = await env.DB.prepare(`SELECT current_stock FROM inventory_branch_stock WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`).bind(tenantId, itemId, branchId).first();
  if (row) return Number(row.current_stock || 0);
  const item = await env.DB.prepare(`SELECT current_stock FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(tenantId, itemId).first();
  return Number(item?.current_stock || 0);
}

async function setBranchStock(env, itemId, branchId, nextStock) {
  const tenantId = currentTenantId(env);
  const ts = getTimestamps();
  const updated = await env.DB.prepare(
    `UPDATE inventory_branch_stock SET current_stock = ?, updated_at_utc = ? WHERE tenant_id = ? AND item_id = ? AND branch_id = ?`
  ).bind(Number(nextStock || 0), ts.utc, tenantId, itemId, branchId).run();
  if (Number(updated.meta?.changes || 0) === 0) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO inventory_branch_stock (tenant_id, item_id, branch_id, current_stock, updated_at_utc)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(tenantId, itemId, branchId, Number(nextStock || 0), ts.utc).run();
  }
}

async function setProductSoldOut(env, productId, soldOut, branchId = null) {
  const settings = await readMenuSettings(env);
  const branchSettings = normalizeBranchSettings(settings.branchSettings || DEFAULT_BRANCH_SETTINGS);
  const selectedBranch = selectedBranchFrom(branchSettings, branchId || branchSettings.defaultBranchId);

  // Agotado ahora vive por sucursal. Para evitar que un agotado viejo global
  // siga bloqueando el producto, limpiamos cualquier soldOut legacy en overrides.
  const nextOverrides = { ...(settings.overrides || {}) };
  if (nextOverrides[productId]?.soldOut !== undefined) {
    const { soldOut: _legacySoldOut, ...rest } = nextOverrides[productId] || {};
    if (Object.keys(rest).length) nextOverrides[productId] = rest;
    else delete nextOverrides[productId];
  }

  const branches = (branchSettings.branches || []).map((branch) => {
    if (branch.id !== selectedBranch.id) return branch;
    const nextSoldOut = { ...(branch.soldOut || {}) };
    if (soldOut) nextSoldOut[productId] = true;
    else delete nextSoldOut[productId];
    return { ...branch, soldOut: nextSoldOut };
  });

  await writeMenuSettings(env, {
    ...settings,
    overrides: nextOverrides,
    branchSettings: { ...branchSettings, branches },
  });
}


async function getItemByName(env, name) {
  const row = await env.DB.prepare(`SELECT id FROM inventory_items WHERE tenant_id = ? AND lower(name) = lower(?) LIMIT 1`).bind(currentTenantId(env), name).first();
  return row || null;
}

async function upsertOptionFamily(env, family) {
  const ts = getTimestamps();
  const key = String(family.family_key || '').trim();
  const name = String(family.name || '').trim();
  if (!key || !name) return null;
  const tenantId = currentTenantId(env);
  await env.DB.prepare(
    `INSERT INTO stock_option_families (tenant_id, family_key, name, description, sort_order, is_active, created_at_utc, updated_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, family_key) DO UPDATE SET name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at_utc = excluded.updated_at_utc`
  ).bind(tenantId, key, name, family.description || '', Number(family.sort_order || 0), boolNum(family.is_active !== false), ts.utc, ts.utc).run();
  return await env.DB.prepare(`SELECT id FROM stock_option_families WHERE tenant_id = ? AND family_key = ?`).bind(tenantId, key).first();
}

async function upsertFamilyOption(env, familyId, option, sortOrder = 0) {
  const itemId = Number(option.item_id || 0) || (option.item_name ? (await getItemByName(env, option.item_name))?.id : null);
  if (!familyId || !itemId) return null;
  const name = String(option.option_name || option.item_name || '').trim();
  if (!name) return null;
  const ts = getTimestamps();
  const tenantId = currentTenantId(env);
  await env.DB.prepare(
    `INSERT INTO stock_option_family_items (tenant_id, family_id, item_id, option_name, quantity, extra_price, is_default, is_active, sort_order, created_at_utc, updated_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, family_id, option_name) DO UPDATE SET item_id = excluded.item_id, quantity = excluded.quantity, extra_price = excluded.extra_price, is_default = excluded.is_default, is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`
  ).bind(tenantId, familyId, itemId, name, Number(option.quantity || 0), Number(option.extra_price || 0), boolNum(option.is_default), boolNum(option.is_active !== false), sortOrder, ts.utc, ts.utc).run();
  const optionRow = await env.DB.prepare(`SELECT id FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ? AND option_name = ?`).bind(tenantId, familyId, name).first();
  if (!optionRow?.id) return null;
  await env.DB.prepare(`DELETE FROM stock_option_family_item_components WHERE tenant_id = ? AND option_item_id = ?`).bind(currentTenantId(env), optionRow.id).run();
  const components = Array.isArray(option.components) ? option.components : [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index] || {};
    const componentItemId = Number(component.item_id || 0) || (component.item_name ? (await getItemByName(env, component.item_name))?.id : null);
    if (!componentItemId || Number(component.quantity || 0) <= 0) continue;
    await env.DB.prepare(
      `INSERT INTO stock_option_family_item_components (tenant_id, option_item_id, item_id, quantity, sort_order, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(option_item_id, item_id) DO UPDATE SET tenant_id = excluded.tenant_id, quantity = excluded.quantity, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`
    ).bind(currentTenantId(env), optionRow.id, componentItemId, Number(component.quantity || 0), index + 1, ts.utc, ts.utc).run();
  }
  return optionRow;
}

async function upsertProductOptionGroup(env, rule, sortOrder = 0) {
  const familyKey = String(rule.family_key || '').trim();
  const productId = String(rule.product_id || '').trim();
  if (!familyKey || !productId) return false;
  const family = await env.DB.prepare(`SELECT id, name FROM stock_option_families WHERE tenant_id = ? AND family_key = ?`).bind(currentTenantId(env), familyKey).first();
  if (!family?.id) return false;

  const existing = await env.DB.prepare(
    `SELECT id, is_active FROM stock_product_option_groups WHERE tenant_id = ? AND product_id = ? AND family_id = ? LIMIT 1`
  ).bind(currentTenantId(env), productId, family.id).first();

  // Si el usuario quitó manualmente una familia del producto, queda como is_active=0.
  // Las semillas/base no deben reactivarla. Un import CSV o edici?n manual s? puede reactivarla.
  if (rule.fromSeed && existing?.id && Number(existing.is_active || 0) === 0) return true;

  const ts = getTimestamps();
  await env.DB.prepare(
    `INSERT INTO stock_product_option_groups (tenant_id, product_id, family_id, label, min_select, max_included, max_total, default_option_name, extra_price, is_required, is_active, sort_order, created_at_utc, updated_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, product_id, family_id) DO UPDATE SET label = excluded.label, min_select = excluded.min_select, max_included = excluded.max_included, max_total = excluded.max_total, default_option_name = excluded.default_option_name, extra_price = excluded.extra_price, is_required = excluded.is_required, is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`
  ).bind(currentTenantId(env), productId, family.id, rule.label || family.name, Number(rule.min_select || 0), Number(rule.max_included || 0), Number(rule.max_total || 1), rule.default_option_name || '', Number(rule.extra_price || 0), boolNum(rule.is_required), boolNum(rule.is_active !== false), sortOrder, ts.utc, ts.utc).run();
  return true;
}

async function seedOptionFamilies(env) {
  const families = [
    { family_key: 'jarabes', name: 'Jarabes', description: 'Sabores para café y frappés' },
    { family_key: 'leches', name: 'Leches', description: 'Tipo de leche para bebidas' },
    { family_key: 'aderezos-acompanamiento', name: 'Aderezos de acompañamiento', description: 'Aderezo aparte para chapatas, wraps y ensaladas' },
    { family_key: 'aderezos-internos', name: 'Aderezos internos', description: 'Salsas/aderezos dentro del producto' },
    { family_key: 'toppings-dulces', name: 'Toppings dulces', description: 'Sabores y toppings de crepas dulces' },
    { family_key: 'proteinas', name: 'Proteínas', description: 'Proteínas disponibles' },
    { family_key: 'quesos', name: 'Quesos', description: 'Quesos disponibles' },
  ];
  const familyOptions = {
    'jarabes': [
      ['Jarabe vainilla francesa', 'Vainilla francesa', 20, 10], ['Jarabe caramelo salado', 'Caramelo salado', 20, 10], ['Jarabe vainilla sin azúcar', 'Vainilla sin azúcar', 20, 10], ['Jarabe caramelo sin azúcar', 'Caramelo sin azúcar', 20, 10]
    ],
    'leches': [['Leche entera', 'Leche entera', 250, 0, true], ['Leche deslactosada', 'Leche deslactosada', 250, 0]],
    'aderezos-acompanamiento': [['Aderezo chipotle preparado', 'Chipotle', 40, 10], ['Blue cheese de la casa', 'Blue cheese', 40, 10], ['Salsa BBQ', 'Barbecue', 40, 10], ['Ensalada italiana', 'Salsa italiana', 40, 10]],
    'aderezos-internos': [['Salsa de tomate', 'Salsa de tomate', 30, 0], ['Aderezo chipotle preparado', 'Chipotle', 30, 0], ['Salsa BBQ', 'Barbecue', 30, 0], ['Blue cheese de la casa', 'Blue cheese', 30, 0], ['Mayonesa', 'Mayonesa', 15, 0]],
    'toppings-dulces': [['Nutella', 'Nutella', 35, 10], ['Cajeta', 'Cajeta', 30, 10], ['Queso crema dulce', 'Queso crema dulce', 35, 10], ['Lechera', 'Lechera', 25, 10], ['Fresa', 'Fresa', 40, 10], ['Plátano', 'Plátano', 40, 10], ['Nuez', 'Nuez', 15, 10]],
    'proteinas': [['Pollo', 'Pollo', 100, 15], ['Jamón de pavo', 'Jamón de pavo', 60, 10], ['Pepperoni', 'Pepperoni', 45, 10]],
    'quesos': [['Queso manchego', 'Queso manchego', 35, 10], ['Queso mozzarella', 'Queso mozzarella', 35, 10], ['Mix quesos', 'Mix quesos', 40, 10]],
  };
  for (let i = 0; i < families.length; i += 1) {
    const existingFamily = await env.DB.prepare(`SELECT id FROM stock_option_families WHERE tenant_id = ? AND family_key = ?`)
      .bind(currentTenantId(env), families[i].family_key)
      .first();
    const fam = await upsertOptionFamily(env, { ...families[i], sort_order: i + 1 });
    if (!fam?.id) continue;
    // Solo sembrar opciones cuando la familia acaba de crearse. Si ya existia,
    // respetamos ediciones manuales como quitar Salsa italiana o agregar jalapeños.
    if (existingFamily?.id) continue;
    const options = familyOptions[families[i].family_key] || [];
    for (let j = 0; j < options.length; j += 1) {
      const [item_name, option_name, quantity, extra_price, is_default] = options[j];
      await upsertFamilyOption(env, fam.id, { item_name, option_name, quantity, extra_price, is_default }, j + 1);
    }
  }
  const productRules = [
    ['latte','leches','Tipo de leche',1,1,1,'Leche entera',0,1], ['latte','jarabes','Jarabe',0,0,2,'',10,0],
    ['frappe','leches','Tipo de leche',1,1,1,'Leche entera',0,1], ['frappe','jarabes','Jarabe',0,0,2,'',10,0],
    ['crepa-dulce','toppings-dulces','Sabores y toppings',1,2,5,'',10,1],
    ['crepa-salada','proteinas','Proteína',1,1,2,'Jamón de pavo',10,1], ['crepa-salada','quesos','Queso',1,1,2,'Queso manchego',10,1],
  ];
  const productIds = ['panini-jamon-queso','panini-pizza','panini-pollo-chipotle','panini-pollo-bbq','wrap-jamon-queso','wrap-pollo-chipotle','wrap-pollo-bbq','wrap-pecas'];
  const internalDefaults = {
    'panini-jamon-queso':'Mayonesa','panini-pizza':'Salsa de tomate','panini-pollo-chipotle':'Chipotle','panini-pollo-bbq':'Barbecue',
    'wrap-jamon-queso':'Mayonesa','wrap-pollo-chipotle':'Chipotle','wrap-pollo-bbq':'Barbecue','wrap-pecas':'Blue cheese'
  };
  for (const productId of productIds) {
    productRules.push([productId,'aderezos-internos','Aderezo interno',1,1,1,internalDefaults[productId] || '',0,1]);
    productRules.push([productId,'aderezos-acompanamiento','Aderezo de acompañamiento',0,1,2,'',10,0]);
  }
  const saladDefaults = {'ensalada-blue':'Blue cheese','ensalada-chipotle':'Chipotle','ensalada-bbq':'Barbecue','ensalada-fresa-nuez':'Salsa italiana'};
  for (const [productId, def] of Object.entries(saladDefaults)) productRules.push([productId,'aderezos-acompanamiento','Aderezo',1,1,2,def,10,1]);
  for (let i = 0; i < productRules.length; i += 1) {
    const [product_id, family_key, label, min_select, max_included, max_total, default_option_name, extra_price, is_required] = productRules[i];
    await upsertProductOptionGroup(env, { product_id, family_key, label, min_select, max_included, max_total, default_option_name, extra_price, is_required, fromSeed: true }, i + 1);
  }
}

async function saveOptionFamily(env, family = {}) {
  const fam = await upsertOptionFamily(env, family);
  if (!fam?.id) throw new Error('No se pudo guardar la familia.');

  // Las opciones se reemplazan completas porque son parte interna de la familia.
  await env.DB.prepare(`DELETE FROM stock_option_family_item_components WHERE tenant_id = ? AND option_item_id IN (SELECT id FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ?)`).bind(currentTenantId(env), currentTenantId(env), fam.id).run();
  await env.DB.prepare(`DELETE FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ?`).bind(currentTenantId(env), fam.id).run();
  const options = Array.isArray(family.options) ? family.options : [];
  for (let i = 0; i < options.length; i += 1) await upsertFamilyOption(env, fam.id, options[i], i + 1);

  // Las reglas producto+familia NO se borran fisicamente.
  // Si el usuario quito una regla, queda inactiva. Asi seedOptionFamilies no la revive.
  const incomingRules = Array.isArray(family.productRules) ? family.productRules : [];
  const incomingProductIds = new Set(incomingRules.map((rule) => String(rule.product_id || '').trim()).filter(Boolean));
  const existingRules = await env.DB.prepare(`SELECT id, product_id FROM stock_product_option_groups WHERE tenant_id = ? AND family_id = ?`).bind(currentTenantId(env), fam.id).all();
  for (const existing of existingRules.results || []) {
    if (!incomingProductIds.has(String(existing.product_id || '').trim())) {
      await env.DB.prepare(`UPDATE stock_product_option_groups SET is_active = 0, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(getTimestamps().utc, currentTenantId(env), existing.id).run();
    }
  }

  for (let i = 0; i < incomingRules.length; i += 1) {
    await upsertProductOptionGroup(env, { ...incomingRules[i], family_key: family.family_key, is_active: incomingRules[i].is_active !== false }, i + 1);
  }
}

async function removeProductFamilyRule(env, { familyId, familyKey, productId }) {
  const cleanProductId = String(productId || '').trim();
  if (!cleanProductId) throw new Error('Falta producto.');
  let fam = null;
  if (familyId) fam = await env.DB.prepare(`SELECT id FROM stock_option_families WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), Number(familyId)).first();
  if (!fam?.id && familyKey) fam = await env.DB.prepare(`SELECT id FROM stock_option_families WHERE tenant_id = ? AND family_key = ?`).bind(currentTenantId(env), String(familyKey).trim()).first();
  if (!fam?.id) throw new Error('Familia no encontrada.');
  await env.DB.prepare(`UPDATE stock_product_option_groups SET is_active = 0, updated_at_utc = ? WHERE tenant_id = ? AND family_id = ? AND product_id = ?`).bind(getTimestamps().utc, currentTenantId(env), fam.id, cleanProductId).run();
}

function normalizeImportedBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'si', 's?', 'yes', 'y', 'x'].includes(normalized);
}

async function validateFamilyImportRows(env, rows = []) {
  const errors = [];
  const knownItems = new Set(((await env.DB.prepare(`SELECT lower(name) AS name FROM inventory_items WHERE tenant_id = ?`).bind(currentTenantId(env)).all()).results || []).map((row) => row.name));
  const optionNames = new Map();
  const existingOptions = (await env.DB.prepare(
    `SELECT f.family_key, lower(oi.option_name) AS option_name
     FROM stock_option_family_items oi
     JOIN stock_option_families f ON f.tenant_id = oi.tenant_id AND f.id = oi.family_id
     WHERE oi.tenant_id = ?`
  ).bind(currentTenantId(env)).all()).results || [];
  for (const option of existingOptions) {
    if (!optionNames.has(option.family_key)) optionNames.set(option.family_key, new Set());
    optionNames.get(option.family_key).add(option.option_name);
  }
  rows.forEach((row, index) => {
    const line = Number(row.__line || index + 2);
    const familyKey = String(row.family_key || '').trim();
    const rowType = String(row.row_type || row.record_type || '').trim().toLowerCase();
    if (rowType === 'family') return;
    if (!familyKey) errors.push({ line, field: 'family_key', message: 'Falta la clave de familia.' });
    if (!['option','family_option','component','family_component','product_rule','family_product_rule'].includes(rowType)) errors.push({ line, field: 'row_type', message: `Tipo de fila no reconocido: ${rowType || 'vac?o'}.` });
    if (['option','family_option'].includes(rowType)) {
      const optionName = String(row.option_name || '').trim();
      const ingredient = String(row.ingredient_name || row.item_name || '').trim();
      if (!optionName) errors.push({ line, field: 'option_name', message: 'Falta el nombre de la opci?n.' });
      if (!ingredient) errors.push({ line, field: 'ingredient_name', message: 'Falta el ingrediente principal.' });
      else if (!knownItems.has(ingredient.toLowerCase())) errors.push({ line, field: 'ingredient_name', message: `No existe el ingrediente ?${ingredient}?.` });
      if (!optionNames.has(familyKey)) optionNames.set(familyKey, new Set());
      optionNames.get(familyKey).add(optionName.toLowerCase());
    }
    if (['component','family_component'].includes(rowType)) {
      const optionName = String(row.option_name || '').trim();
      const ingredient = String(row.ingredient_name || row.item_name || '').trim();
      if (!optionName) errors.push({ line, field: 'option_name', message: 'El componente debe indicar a qu? opci?n pertenece.' });
      if (!ingredient) errors.push({ line, field: 'ingredient_name', message: 'Falta el ingrediente del componente.' });
      else if (!knownItems.has(ingredient.toLowerCase())) errors.push({ line, field: 'ingredient_name', message: `No existe el ingrediente ?${ingredient}?.` });
      if (Number(row.quantity || 0) <= 0) errors.push({ line, field: 'quantity', message: 'La cantidad del componente debe ser mayor a 0.' });
    }
    if (['product_rule','family_product_rule'].includes(rowType) && !String(row.product_id || '').trim()) errors.push({ line, field: 'product_id', message: 'Falta product_id.' });
  });
  rows.forEach((row, index) => {
    const rowType = String(row.row_type || row.record_type || '').trim().toLowerCase();
    if (!['component','family_component'].includes(rowType)) return;
    const familyKey = String(row.family_key || '').trim();
    const optionName = String(row.option_name || '').trim().toLowerCase();
    if (!optionNames.get(familyKey)?.has(optionName)) errors.push({ line: Number(row.__line || index + 2), field: 'option_name', message: `No existe una fila option para ?${row.option_name}? dentro de ${familyKey}.` });
  });
  return errors;
}

async function importOptionFamilies(env, rows = [], mode = 'upsert') {
  const errors = await validateFamilyImportRows(env, rows);
  if (errors.length) {
    const error = new Error(`CSV de familias inv?lido: ${errors.length} error(es).`);
    error.validationErrors = errors;
    throw error;
  }
  const grouped = new Map();
  for (const row of rows || []) {
    const key = String(row.family_key || '').trim();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, { family: row, options: [], components: [], productRules: [] });
    const group = grouped.get(key);
    if (row.family_name || row.family_description) group.family = { ...group.family, ...row };
    const rowType = String(row.row_type || row.record_type || '').trim().toLowerCase();
    if (rowType === 'option' || String(row.record_type || '').toLowerCase() === 'family_option') group.options.push(row);
    else if (rowType === 'component' || String(row.record_type || '').toLowerCase() === 'family_component') group.components.push(row);
    else if (rowType === 'product_rule' || String(row.record_type || '').toLowerCase() === 'family_product_rule') group.productRules.push(row);
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const [familyKey, group] of grouped.entries()) {
    const existing = await env.DB.prepare(`SELECT id FROM stock_option_families WHERE tenant_id = ? AND family_key = ?`).bind(currentTenantId(env), familyKey).first();
    if (!existing?.id && mode === 'updateOnly') {
      skipped += 1;
      continue;
    }

    const familyRow = group.family || {};
    const fam = await upsertOptionFamily(env, {
      family_key: familyKey,
      name: familyRow.family_name || familyRow.name || familyKey,
      description: familyRow.family_description || familyRow.description || '',
      sort_order: Number(familyRow.family_sort_order || familyRow.sort_order || 0),
      is_active: normalizeImportedBool(familyRow.family_active ?? familyRow.is_active, true),
    });
    if (!fam?.id) {
      skipped += 1;
      continue;
    }

    if (group.options.length > 0) {
      await env.DB.prepare(`DELETE FROM stock_option_family_item_components WHERE tenant_id = ? AND option_item_id IN (SELECT id FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ?)`).bind(currentTenantId(env), currentTenantId(env), fam.id).run();
      await env.DB.prepare(`DELETE FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ?`).bind(currentTenantId(env), fam.id).run();
    }

    const incomingRuleProducts = new Set((group.productRules || []).map((rule) => String(rule.product_id || '').trim()).filter(Boolean));
    if (group.productRules.length > 0) {
      const existingRules = await env.DB.prepare(`SELECT id, product_id FROM stock_product_option_groups WHERE tenant_id = ? AND family_id = ?`).bind(currentTenantId(env), fam.id).all();
      for (const existingRule of existingRules.results || []) {
        if (!incomingRuleProducts.has(String(existingRule.product_id || '').trim())) {
          await env.DB.prepare(`UPDATE stock_product_option_groups SET is_active = 0, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(getTimestamps().utc, currentTenantId(env), existingRule.id).run();
        }
      }
    }

    let sort = 1;
    for (const option of group.options) {
      const optionName = option.option_name || option.name || '';
      const components = (group.components || []).filter((component) => String(component.option_name || '').trim().toLowerCase() === String(optionName).trim().toLowerCase()).map((component) => ({
        item_name: component.ingredient_name || component.item_name || '',
        quantity: Number(component.quantity || 0),
      }));
      const ok = await upsertFamilyOption(env, fam.id, {
        option_name: optionName,
        item_name: option.ingredient_name || option.item_name || '',
        quantity: Number(option.quantity || 0),
        extra_price: Number(option.option_extra_price || option.extra_price || 0),
        is_default: normalizeImportedBool(option.option_default ?? option.is_default, false),
        is_active: normalizeImportedBool(option.option_active ?? option.is_active, true),
        components,
      }, Number(option.option_sort_order || option.sort_order || sort));
      if (ok) sort += 1;
      else skipped += 1;
    }

    if (group.options.length === 0 && group.components.length > 0) {
      const componentsByOption = new Map();
      for (const component of group.components) {
        const optionName = String(component.option_name || '').trim();
        if (!optionName) continue;
        if (!componentsByOption.has(optionName)) componentsByOption.set(optionName, []);
        componentsByOption.get(optionName).push(component);
      }
      for (const [optionName, components] of componentsByOption.entries()) {
        const optionRow = await env.DB.prepare(
          `SELECT id FROM stock_option_family_items WHERE tenant_id = ? AND family_id = ? AND lower(option_name) = lower(?) LIMIT 1`
        ).bind(currentTenantId(env), fam.id, optionName).first();
        if (!optionRow?.id) {
          skipped += components.length;
          continue;
        }
        await env.DB.prepare(`DELETE FROM stock_option_family_item_components WHERE tenant_id = ? AND option_item_id = ?`).bind(currentTenantId(env), optionRow.id).run();
        for (let index = 0; index < components.length; index += 1) {
          const component = components[index] || {};
          const componentItemId = Number(component.item_id || 0)
            || (component.ingredient_name ? (await getItemByName(env, component.ingredient_name))?.id : null)
            || (component.item_name ? (await getItemByName(env, component.item_name))?.id : null);
          if (!componentItemId || Number(component.quantity || 0) <= 0) {
            skipped += 1;
            continue;
          }
          const ts = getTimestamps();
          await env.DB.prepare(
            `INSERT INTO stock_option_family_item_components (option_item_id, item_id, quantity, sort_order, created_at_utc, updated_at_utc)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(option_item_id, item_id) DO UPDATE SET quantity = excluded.quantity, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`
          ).bind(optionRow.id, componentItemId, Number(component.quantity || 0), index + 1, ts.utc, ts.utc).run();
        }
      }
    }

    sort = 1;
    for (const rule of group.productRules) {
      const ok = await upsertProductOptionGroup(env, {
        family_key: familyKey,
        product_id: rule.product_id || '',
        label: rule.label || familyRow.family_name || familyKey,
        min_select: Number(rule.min_select || 0),
        max_included: Number(rule.max_included || 0),
        max_total: Number(rule.max_total || 1),
        default_option_name: rule.default_option_name || '',
        extra_price: Number(rule.product_extra_price || rule.extra_price || 0),
        is_required: normalizeImportedBool(rule.required ?? rule.is_required, false),
        is_active: normalizeImportedBool(rule.rule_active ?? rule.is_active, true),
      }, Number(rule.rule_sort_order || rule.sort_order || sort));
      if (ok) sort += 1;
      else skipped += 1;
    }

    if (existing?.id) updated += 1;
    else imported += 1;
  }

  return { imported, updated, skipped };
}

async function listData(env, requestedBranchId = null) {
  const tenantId = currentTenantId(env);
  try { await seedOptionFamilies(env); } catch (error) {}
  // Ensure all menu product recipe shells exist before reading/exporting.
  // This makes Stock > Import > Descargar datos actuales show every product,
  // even when a recipe has no ingredient lines yet.
  try {
    await ensureProductRecipeShells(env);
  } catch (error) {
    // Do not block stock if shell creation fails; seedRecipeDefaults will still report errors.
  }

  const branchContext = await resolveBranch(env, requestedBranchId);
  await ensureBranchStock(env, branchContext.branchId);

  const [items, units, categories, suppliers, movements, wasteRequests, inventoryCountRequests, recipesRaw, recipeLinesRaw, optionFamiliesRaw, optionItemsRaw, optionComponentsRaw, productOptionGroupsRaw] = await Promise.all([
    env.DB.prepare(
      `SELECT i.*, COALESCE(bs.current_stock, i.current_stock, 0) AS current_stock, u.code AS unit_code, u.name AS unit_name,
        ps.name AS supplier_name,
        alt.name AS alt_supplier_name,
        pc.name AS purchase_category_name
       FROM inventory_items i
       LEFT JOIN inventory_branch_stock bs ON bs.tenant_id = i.tenant_id AND bs.item_id = i.id AND bs.branch_id = ?
       LEFT JOIN stock_units u ON u.id = i.unit_id
       LEFT JOIN stock_suppliers ps ON ps.id = i.primary_supplier_id
       LEFT JOIN stock_suppliers alt ON alt.id = i.alt_supplier_id
       LEFT JOIN stock_purchase_categories pc ON pc.id = i.purchase_category_id
       WHERE i.tenant_id = ?
       ORDER BY pc.sort_order ASC, i.name ASC`
    ).bind(branchContext.branchId, tenantId).all(),
    env.DB.prepare(`SELECT * FROM stock_units ORDER BY sort_order ASC, name ASC`).all(),
    env.DB.prepare(`SELECT * FROM stock_purchase_categories WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC`).bind(tenantId).all(),
    env.DB.prepare(`SELECT * FROM stock_suppliers WHERE tenant_id = ? ORDER BY name ASC`).bind(tenantId).all(),
    env.DB.prepare(
      `SELECT m.*, i.name AS item_name, u.code AS unit_code
       FROM stock_movements m
       LEFT JOIN inventory_items i ON i.tenant_id = m.tenant_id AND i.id = m.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE m.tenant_id = ? AND COALESCE(m.branch_id, 'dominio') = ?
       ORDER BY m.created_at_utc DESC
       LIMIT 150`
    ).bind(tenantId, branchContext.branchId).all(),
    env.DB.prepare(
      `SELECT w.*, i.name AS item_name, u.code AS unit_code
       FROM waste_requests w
       LEFT JOIN inventory_items i ON i.tenant_id = w.tenant_id AND i.id = w.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE w.tenant_id = ? AND COALESCE(w.branch_id, 'dominio') = ?
       ORDER BY w.created_at_utc DESC
       LIMIT 100`
    ).bind(tenantId, branchContext.branchId).all(),
    env.DB.prepare(
      `SELECT c.*, i.name AS item_name, u.code AS unit_code
       FROM inventory_count_requests c
       LEFT JOIN inventory_items i ON i.tenant_id = c.tenant_id AND i.id = c.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE c.tenant_id = ? AND COALESCE(c.branch_id, 'dominio') = ?
       ORDER BY c.created_at_utc DESC
       LIMIT 150`
    ).bind(tenantId, branchContext.branchId).all(),
    env.DB.prepare(
      `SELECT r.*, i.name AS output_item_name, u.code AS output_unit_code
       FROM stock_recipes r
       LEFT JOIN inventory_items i ON i.tenant_id = r.tenant_id AND i.id = r.output_item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE r.tenant_id = ?
       ORDER BY r.recipe_type ASC, r.name ASC`
    ).bind(tenantId).all(),
    env.DB.prepare(
      `SELECT l.*, i.name AS item_name, i.brand AS item_brand, u.code AS unit_code
       FROM stock_recipe_lines l
       LEFT JOIN inventory_items i ON i.tenant_id = l.tenant_id AND i.id = l.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE l.tenant_id = ?
       ORDER BY l.recipe_id ASC, l.sort_order ASC, l.id ASC`
    ).bind(tenantId).all(),
    env.DB.prepare(`SELECT * FROM stock_option_families WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC`).bind(tenantId).all(),
    env.DB.prepare(
      `SELECT oi.*, f.family_key, i.name AS item_name, i.brand AS item_brand, u.code AS unit_code
       FROM stock_option_family_items oi
       JOIN stock_option_families f ON f.tenant_id = oi.tenant_id AND f.id = oi.family_id
       JOIN inventory_items i ON i.tenant_id = oi.tenant_id AND i.id = oi.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE oi.tenant_id = ?
       ORDER BY oi.family_id ASC, oi.sort_order ASC, oi.id ASC`
    ).bind(tenantId).all(),
    env.DB.prepare(
      `SELECT c.*, oi.family_id, oi.option_name, i.name AS item_name, u.code AS unit_code
       FROM stock_option_family_item_components c
       JOIN stock_option_family_items oi ON oi.tenant_id = c.tenant_id AND oi.id = c.option_item_id
       JOIN inventory_items i ON i.tenant_id = c.tenant_id AND i.id = c.item_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE c.tenant_id = ?
       ORDER BY c.option_item_id ASC, c.sort_order ASC, c.id ASC`
    ).bind(tenantId).all(),
    env.DB.prepare(
      `SELECT pg.*, f.family_key, f.name AS family_name
       FROM stock_product_option_groups pg
       JOIN stock_option_families f ON f.tenant_id = pg.tenant_id AND f.id = pg.family_id
       WHERE pg.tenant_id = ?
       ORDER BY pg.product_id ASC, pg.sort_order ASC, pg.id ASC`
    ).bind(tenantId).all(),
  ]);

  const linesByRecipe = new Map();
  for (const line of recipeLinesRaw.results || []) {
    if (!linesByRecipe.has(line.recipe_id)) linesByRecipe.set(line.recipe_id, []);
    linesByRecipe.get(line.recipe_id).push(line);
  }

  const recipes = (recipesRaw.results || []).map((recipe) => ({
    ...recipe,
    lines: linesByRecipe.get(recipe.id) || [],
  }));


  const componentsByOption = new Map();
  for (const component of optionComponentsRaw.results || []) {
    if (!componentsByOption.has(component.option_item_id)) componentsByOption.set(component.option_item_id, []);
    componentsByOption.get(component.option_item_id).push(component);
  }

  const optionsByFamily = new Map();
  for (const option of optionItemsRaw.results || []) {
    option.components = componentsByOption.get(option.id) || [];

    if (!optionsByFamily.has(option.family_id)) optionsByFamily.set(option.family_id, []);
    optionsByFamily.get(option.family_id).push(option);
  }
  const rulesByFamily = new Map();
  for (const rule of productOptionGroupsRaw.results || []) {
    if (Number(rule.is_active || 0) === 0) continue;
    if (!rulesByFamily.has(rule.family_id)) rulesByFamily.set(rule.family_id, []);
    rulesByFamily.get(rule.family_id).push(rule);
  }
  const optionFamilies = (optionFamiliesRaw.results || []).map((family) => ({
    ...family,
    options: optionsByFamily.get(family.id) || [],
    productRules: rulesByFamily.get(family.id) || [],
  }));

  const menuSettingsRaw = await readMenuSettings(env);
  const effectiveBranch = selectedBranchFrom(menuSettingsRaw.branchSettings || branchContext.branchSettings || DEFAULT_BRANCH_SETTINGS, branchContext.branchId);
  const branchSoldOut = effectiveBranch?.soldOut || {};
  const effectiveOverrides = { ...(menuSettingsRaw.overrides || {}) };
  // Siempre ignoramos soldOut global legacy en Stock. El estado operativo
  // de agotado debe venir de la sucursal seleccionada, aun si multi-sucursal
  // est? apagado y se usa la sucursal default.
  for (const productId of Object.keys(effectiveOverrides)) {
    if (effectiveOverrides[productId]) {
      const { soldOut, ...rest } = effectiveOverrides[productId];
      effectiveOverrides[productId] = rest;
    }
  }
  for (const [productId, soldOut] of Object.entries(branchSoldOut)) {
    effectiveOverrides[productId] = { ...(effectiveOverrides[productId] || {}), soldOut: Boolean(soldOut) };
  }
  const menuSettings = { ...menuSettingsRaw, overrides: effectiveOverrides };

  return {
    items: items.results || [],
    units: units.results || [],
    categories: categories.results || [],
    suppliers: suppliers.results || [],
    movements: movements.results || [],
    wasteRequests: wasteRequests.results || [],
    inventoryCountRequests: inventoryCountRequests.results || [],
    recipes,
    optionFamilies,
    menuSettings,
    branchSettings: branchContext.branchSettings,
    selectedBranch: { id: branchContext.branchId, name: branchContext.branchName },
  };
}
function boolNum(value) {
  return value ? 1 : 0;
}

function nullableId(value) {
  return value === '' || value === undefined || value === null ? null : Number(value);
}


function nullableText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeImportKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const ITEM_IMPORT_ALIASES = {
  ingrediente: 'name',
  insumo: 'name',
  producto: 'name',
  nombre: 'name',
  name: 'name',
  marca: 'brand',
  brand: 'brand',
  tipo: 'item_type',
  item_type: 'item_type',
  unidad: 'unit_code',
  unidad_base: 'unit_code',
  unit: 'unit_code',
  unit_code: 'unit_code',
  stock: 'current_stock',
  stock_actual: 'current_stock',
  cantidad: 'current_stock',
  current_stock: 'current_stock',
  minimo: 'min_stock',
  min: 'min_stock',
  min_stock: 'min_stock',
  maximo: 'max_stock',
  max: 'max_stock',
  max_stock: 'max_stock',
  precision: 'accuracy_target',
  accuracy: 'accuracy_target',
  accuracy_target: 'accuracy_target',
  proveedor: 'primary_supplier',
  proveedor_principal: 'primary_supplier',
  primary_supplier: 'primary_supplier',
  proveedor_alt: 'alt_supplier',
  proveedor_alterno: 'alt_supplier',
  alt_supplier: 'alt_supplier',
  categoria_compra: 'purchase_category',
  purchase_category: 'purchase_category',
  presentacion: 'purchase_unit_label',
  purchase_unit_label: 'purchase_unit_label',
  cantidad_presentacion: 'purchase_unit_quantity',
  purchase_unit_quantity: 'purchase_unit_quantity',
  precio: 'purchase_price',
  costo: 'purchase_price',
  purchase_price: 'purchase_price',
  caducidad: 'expiry_date',
  expiry_date: 'expiry_date',
};

function normalizeItemImportRow(row = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeImportKey(key);
    normalized[ITEM_IMPORT_ALIASES[normalizedKey] || normalizedKey] = value;
  }
  return normalized;
}

function normalizeUnitCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  const ascii = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const compact = ascii.replace(/\s+/g, '');
  const aliases = {
    gramos: 'g',
    gramo: 'g',
    gr: 'g',
    g: 'g',
    kilos: 'kg',
    kilo: 'kg',
    kilogramo: 'kg',
    kilogramos: 'kg',
    kg: 'kg',
    mililitros: 'ml',
    mililitro: 'ml',
    ml: 'ml',
    litros: 'l',
    litro: 'l',
    l: 'l',
    piezas: 'pieza',
    pieza: 'pieza',
    pza: 'pieza',
    pzas: 'pieza',
    unidades: 'pieza',
    unidad: 'pieza',
    bolsa: 'bolsa',
    bolsas: 'bolsa',
    paquete: 'paquete',
    paquetes: 'paquete',
    caja: 'caja',
    cajas: 'caja',
    porcion: 'porcion',
    porciones: 'porcion',
  };
  return aliases[compact] || compact || 'pieza';
}

function cleanRecipeLineRole(role) {
  const value = String(role || 'ingrediente').trim();
  if (value === 'extra' || value === 'opcion_cliente' || value === 'porcion_estandar') return 'ingrediente';
  const allowed = new Set(['ingrediente', 'empaque', 'aderezo_interno', 'aderezo_acompanamiento', 'cubiertos', 'hielo']);
  return allowed.has(value) ? value : 'ingrediente';
}

function normalizeRecipeLineFlags(line) {
  const isExtra = boolNum(line.is_extra_billable);
  const isOptional = boolNum(line.is_optional || line.is_extra_billable);
  const clientVisible = boolNum(line.client_visible || line.is_optional || line.is_extra_billable || line.client_removable || line.client_changeable);
  return {
    lineRole: cleanRecipeLineRole(line.line_role),
    clientVisible,
    clientRemovable: boolNum(line.client_removable),
    clientChangeable: boolNum(line.client_changeable),
    isDefault: boolNum(line.is_default),
    isOptional,
    isExtraBillable: isExtra,
    extraPrice: Number(line.extra_price || (isExtra ? 10 : 0)),
  };
}


async function getOrCreateLookup(env, table, column, value, extraColumns = '', extraValues = []) {
  const text = nullableText(value);
  if (!text) return null;
  if (table === 'stock_units') {
    const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE lower(${column}) = lower(?)`).bind(text).first();
    if (row?.id) return row.id;
    const extraNames = extraColumns ? `, ${extraColumns}` : '';
    const placeholders = ['?'].concat(extraValues.map(() => '?')).join(', ');
    await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (${column}${extraNames}) VALUES (${placeholders})`).bind(text, ...extraValues).run();
    const created = await env.DB.prepare(`SELECT id FROM ${table} WHERE lower(${column}) = lower(?)`).bind(text).first();
    return created?.id || null;
  }
  const tenantId = currentTenantId(env);
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE tenant_id = ? AND lower(${column}) = lower(?)`).bind(tenantId, text).first();
  if (row?.id) return row.id;

  const extraNames = extraColumns ? `, ${extraColumns}` : '';
  const placeholders = ['?', '?'].concat(extraValues.map(() => '?')).join(', ');
  await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (tenant_id, ${column}${extraNames}) VALUES (${placeholders})`).bind(tenantId, text, ...extraValues).run();
  const created = await env.DB.prepare(`SELECT id FROM ${table} WHERE tenant_id = ? AND lower(${column}) = lower(?)`).bind(tenantId, text).first();
  return created?.id || null;
}

async function getOrCreateUnit(env, code) {
  const text = nullableText(normalizeUnitCode(code));
  if (!text) return null;
  const row = await env.DB.prepare(`SELECT id FROM stock_units WHERE lower(code) = lower(?)`).bind(text).first();
  if (row?.id) return row.id;
  await env.DB.prepare(
    `INSERT INTO stock_units (code, name, kind, sort_order) VALUES (?, ?, 'general', 999)`
  ).bind(text, text).run();
  const created = await env.DB.prepare(`SELECT id FROM stock_units WHERE lower(code) = lower(?)`).bind(text).first();
  return created?.id || null;
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  if (Number.isNaN(number) || number < 0) return 0;
  return number;
}

function wholeNonNegativeNumber(value, label = 'Cantidad', fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} debe ser un numero entero mayor o igual a cero.`);
  if (!Number.isInteger(number)) throw new Error(`${label} debe ser un numero entero. No uses decimales.`);
  return number;
}

function wholeNumber(value, label = 'Cantidad') {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || !Number.isInteger(number)) throw new Error(`${label} debe ser un numero entero. No uses decimales.`);
  return number;
}

async function saveItem(env, item) {
  const tenantId = currentTenantId(env);
  const now = new Date().toISOString();
  const values = [
    item.name?.trim(),
    item.brand || '',
    item.item_type || 'Ingrediente comprado',
    Number(item.unit_id),
    wholeNonNegativeNumber(item.current_stock, 'Stock actual'),
    wholeNonNegativeNumber(item.min_stock, 'Stock minimo'),
    wholeNonNegativeNumber(item.max_stock, 'Stock maximo'),
    Number(item.accuracy_target || 85),
    nullableId(item.primary_supplier_id),
    nullableId(item.alt_supplier_id),
    nullableId(item.purchase_category_id),
    item.purchase_unit_label || '',
    wholeNonNegativeNumber(item.purchase_unit_quantity, 'Cantidad por presentacion'),
    Number(item.purchase_price || 0),
    item.expiry_date || null,
    boolNum(item.is_active),
    boolNum(item.client_visible),
    boolNum(item.client_removable),
    boolNum(item.client_changeable),
    boolNum(item.deducts_inventory),
    boolNum(item.is_packaging),
    boolNum(item.is_internal_dressing),
    boolNum(item.is_side_dressing),
    boolNum(item.is_sellable_extra),
    now,
  ];

  if (!values[0] || !values[3]) throw new Error('Falta nombre o unidad base.');
  if (values[4] < 0 || values[5] < 0 || values[6] < 0) throw new Error('No se permiten cantidades negativas.');

  if (item.id) {
    await env.DB.prepare(
      `UPDATE inventory_items SET
        name = ?, brand = ?, item_type = ?, unit_id = ?, current_stock = ?, min_stock = ?, max_stock = ?,
        accuracy_target = ?, primary_supplier_id = ?, alt_supplier_id = ?, purchase_category_id = ?,
        purchase_unit_label = ?, purchase_unit_quantity = ?, purchase_price = ?, expiry_date = ?,
        is_active = ?, client_visible = ?, client_removable = ?, client_changeable = ?, deducts_inventory = ?,
        is_packaging = ?, is_internal_dressing = ?, is_side_dressing = ?, is_sellable_extra = ?, updated_at_utc = ?
       WHERE tenant_id = ? AND id = ?`
    ).bind(...values, tenantId, item.id).run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO inventory_items (
      tenant_id, name, brand, item_type, unit_id, current_stock, min_stock, max_stock, accuracy_target,
      primary_supplier_id, alt_supplier_id, purchase_category_id, purchase_unit_label,
      purchase_unit_quantity, purchase_price, expiry_date, is_active, client_visible, client_removable,
      client_changeable, deducts_inventory, is_packaging, is_internal_dressing, is_side_dressing,
      is_sellable_extra, created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(tenantId, ...values, now).run();
}

async function addMovement(env, { itemId, movementType, quantity, reason, sourceType, sourceId, user, approvedBy, branchId, branchName }) {
  const tenantId = currentTenantId(env);
  const branchContext = await resolveBranch(env, branchId);
  const selectedBranchId = branchContext.branchId;
  const selectedBranchName = branchName || branchContext.branchName;
  const item = await env.DB.prepare(`SELECT id, current_stock FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(tenantId, itemId).first();
  if (!item) throw new Error('Ingrediente no encontrado.');

  const stockBefore = await getBranchStock(env, itemId, selectedBranchId);
  const qty = wholeNumber(quantity, 'Cantidad de movimiento');
  if (!qty) throw new Error('Cantidad inv?lida.');
  const stockAfter = stockBefore + qty;
  if (stockAfter < 0) throw new Error('No hay suficiente stock para descontar esa cantidad.');
  const ts = getTimestamps();

  await setBranchStock(env, itemId, selectedBranchId, stockAfter);

  // Mantiene current_stock como espejo de la sucursal default para compatibilidad con vistas/exports viejos.
  if (selectedBranchId === branchContext.branchSettings.defaultBranchId) {
    await env.DB.prepare(`UPDATE inventory_items SET current_stock = ?, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(stockAfter, ts.utc, tenantId, itemId).run();
  } else {
    await env.DB.prepare(`UPDATE inventory_items SET updated_at_utc = ? WHERE tenant_id = ? AND id = ?`).bind(ts.utc, tenantId, itemId).run();
  }

  await env.DB.prepare(
    `INSERT INTO stock_movements (
      tenant_id, item_id, movement_type, quantity, stock_before, stock_after, reason, source_type, source_id,
      reported_by, reported_role, reported_shift, approved_by, branch_id, branch_name, created_at_utc, created_at_monterrey
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tenantId,
    itemId,
    movementType,
    qty,
    stockBefore,
    stockAfter,
    reason || '',
    sourceType || null,
    sourceId || null,
    user.name,
    user.role,
    user.shift,
    approvedBy || null,
    selectedBranchId,
    selectedBranchName,
    ts.utc,
    ts.monterrey
  ).run();
}

async function updateQuickItems(env, items, user, branchId) {
  const tenantId = currentTenantId(env);
  const ts = getTimestamps();
  for (const item of items || []) {
    const itemId = Number(item.id);
    if (!itemId) continue;
    const existing = await env.DB.prepare(`SELECT id FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(tenantId, itemId).first();
    if (!existing) continue;

    const nextStock = wholeNonNegativeNumber(item.current_stock, 'Stock actual');
    const minStock = wholeNonNegativeNumber(item.min_stock, 'Stock minimo');
    const maxStock = wholeNonNegativeNumber(item.max_stock, 'Stock maximo');
    const purchasePrice = nonNegativeNumber(item.purchase_price);
    const expiryDate = item.expiry_date || null;
    const currentStock = await getBranchStock(env, itemId, branchId);
    const diff = nextStock - currentStock;

    await env.DB.prepare(
      `UPDATE inventory_items
       SET min_stock = ?, max_stock = ?, purchase_price = ?, expiry_date = ?, updated_at_utc = ?
       WHERE tenant_id = ? AND id = ?`
    ).bind(minStock, maxStock, purchasePrice, expiryDate, ts.utc, tenantId, itemId).run();

    if (diff !== 0) {
      await addMovement(env, {
        itemId,
        movementType: 'ajuste_rapido',
        quantity: diff,
        reason: 'Edici?n r?pida de inventario',
        sourceType: 'quick_edit',
        user,
        approvedBy: user.name,
        branchId,
      });
    }
  }
}

async function itemByName(env, name) {
  return env.DB.prepare(`SELECT * FROM inventory_items WHERE tenant_id = ? AND lower(name) = lower(?)`).bind(currentTenantId(env), name).first();
}

async function importItems(env, rows, mode, user, branchId) {
  const tenantId = currentTenantId(env);
  const ts = getTimestamps();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const normalizedRows = (rows || []).map(normalizeItemImportRow);
  if (normalizedRows.length > 0 && !normalizedRows.some((row) => nullableText(row.name))) {
    const error = new Error('El CSV de ingredientes no trae columna de nombre reconocible.');
    error.validationErrors = [{ line: 1, field: 'name', message: 'Usa una columna name, nombre, ingrediente o insumo.' }];
    throw error;
  }

  for (const row of normalizedRows) {
    const name = nullableText(row.name);
    if (!name) {
      skipped += 1;
      continue;
    }

    const existing = await itemByName(env, name);
    if (!existing && mode === 'updateOnly') {
      skipped += 1;
      continue;
    }

    const unitId = await getOrCreateUnit(env, row.unit_code || 'pieza');
    const primarySupplierId = await getOrCreateLookup(env, 'stock_suppliers', 'name', row.primary_supplier);
    const altSupplierId = await getOrCreateLookup(env, 'stock_suppliers', 'name', row.alt_supplier);
    const categoryId = await getOrCreateLookup(env, 'stock_purchase_categories', 'name', row.purchase_category, 'sort_order', [999]);
    const nextStock = wholeNonNegativeNumber(row.current_stock, 'Stock actual');
    const minStock = wholeNonNegativeNumber(row.min_stock, 'Stock minimo');
    const maxStock = wholeNonNegativeNumber(row.max_stock, 'Stock maximo');
    const accuracy = nonNegativeNumber(row.accuracy_target, 85) || 85;
    const purchaseQty = wholeNonNegativeNumber(row.purchase_unit_quantity, 'Cantidad por presentacion');
    const purchasePrice = nonNegativeNumber(row.purchase_price);

    if (existing) {
      await env.DB.prepare(
        `UPDATE inventory_items SET
          brand = ?, item_type = ?, unit_id = ?, min_stock = ?, max_stock = ?, accuracy_target = ?,
          primary_supplier_id = ?, alt_supplier_id = ?, purchase_category_id = ?, purchase_unit_label = ?,
          purchase_unit_quantity = ?, purchase_price = ?, expiry_date = ?, updated_at_utc = ?
         WHERE tenant_id = ? AND id = ?`
      ).bind(
        row.brand || existing.brand || '',
        row.item_type || existing.item_type || 'Ingrediente comprado',
        unitId || existing.unit_id,
        minStock,
        maxStock,
        accuracy,
        primarySupplierId,
        altSupplierId,
        categoryId,
        row.purchase_unit_label || existing.purchase_unit_label || '',
        purchaseQty,
        purchasePrice,
        row.expiry_date || null,
        ts.utc,
        tenantId,
        existing.id
      ).run();

      const diff = nextStock - await getBranchStock(env, existing.id, branchId);
      if (diff !== 0) {
        await addMovement(env, {
          itemId: existing.id,
          movementType: 'importacion_csv',
          quantity: diff,
          reason: 'Importaci?n CSV',
          sourceType: 'csv_import',
          user,
          approvedBy: user.name,
          branchId,
        });
      }
      updated += 1;
      continue;
    }

    const insert = await env.DB.prepare(
      `INSERT INTO inventory_items (
        tenant_id, name, brand, item_type, unit_id, current_stock, min_stock, max_stock, accuracy_target,
        primary_supplier_id, alt_supplier_id, purchase_category_id, purchase_unit_label,
        purchase_unit_quantity, purchase_price, expiry_date, is_active, client_visible, client_removable,
        client_changeable, deducts_inventory, is_packaging, is_internal_dressing, is_side_dressing,
        is_sellable_extra, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 1, 0, 0, 0, 0, ?, ?)`
    ).bind(
      tenantId,
      name,
      row.brand || '',
      row.item_type || 'Ingrediente comprado',
      unitId,
      minStock,
      maxStock,
      accuracy,
      primarySupplierId,
      altSupplierId,
      categoryId,
      row.purchase_unit_label || '',
      purchaseQty,
      purchasePrice,
      row.expiry_date || null,
      ts.utc,
      ts.utc
    ).run();

    const itemId = insert.meta?.last_row_id;
    if (itemId && nextStock !== 0) {
      await addMovement(env, {
        itemId,
        movementType: 'importacion_csv',
        quantity: nextStock,
        reason: 'Carga inicial CSV',
        sourceType: 'csv_import',
        user,
        approvedBy: user.name,
        branchId,
      });
    }
    created += 1;
  }

  return { created, updated, skipped };
}


async function getItemIdByName(env, name) {
  const row = await env.DB.prepare(`SELECT id FROM inventory_items WHERE tenant_id = ? AND lower(name) = lower(?)`).bind(currentTenantId(env), name).first();
  return row?.id || null;
}

async function saveRecipe(env, recipe) {
  const tenantId = currentTenantId(env);
  const now = new Date().toISOString();
  const recipeKey = String(recipe.recipe_key || '').trim();
  const recipeType = String(recipe.recipe_type || 'product').trim();
  const name = String(recipe.name || '').trim();
  if (!recipeKey || !name) throw new Error('La receta necesita nombre y clave.');
  const outputItemId = nullableId(recipe.output_item_id);
  const outputQuantity = wholeNonNegativeNumber(recipe.output_quantity, 'Cantidad producida base');
  const lines = Array.isArray(recipe.lines) ? recipe.lines : [];

  let recipeId = recipe.id ? Number(recipe.id) : null;
  const existing = recipeId ? await env.DB.prepare(`SELECT id FROM stock_recipes WHERE tenant_id = ? AND id = ?`).bind(tenantId, recipeId).first() : null;

  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE stock_recipes SET recipe_key = ?, recipe_type = ?, name = ?, output_item_id = ?, output_quantity = ?, notes = ?, is_active = ?, updated_at_utc = ? WHERE tenant_id = ? AND id = ?`
    ).bind(recipeKey, recipeType, name, outputItemId, outputQuantity, recipe.notes || '', boolNum(recipe.is_active !== false), now, tenantId, recipeId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO stock_recipes (tenant_id, recipe_key, recipe_type, name, output_item_id, output_quantity, notes, is_active, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, recipe_key) DO UPDATE SET recipe_type = excluded.recipe_type, name = excluded.name, output_item_id = excluded.output_item_id, output_quantity = excluded.output_quantity, notes = excluded.notes, is_active = excluded.is_active, updated_at_utc = excluded.updated_at_utc`
    ).bind(tenantId, recipeKey, recipeType, name, outputItemId, outputQuantity, recipe.notes || '', boolNum(recipe.is_active !== false), now, now).run();
    const row = await env.DB.prepare(`SELECT id FROM stock_recipes WHERE tenant_id = ? AND recipe_key = ?`).bind(tenantId, recipeKey).first();
    recipeId = row?.id;
  }

  if (!recipeId) throw new Error('No se pudo guardar la receta.');
  await env.DB.prepare(`DELETE FROM stock_recipe_lines WHERE tenant_id = ? AND recipe_id = ?`).bind(tenantId, recipeId).run();

  let sort = 1;
  for (const line of lines) {
    const itemId = Number(line.item_id || line.itemId || 0);
    const quantity = wholeNonNegativeNumber(line.quantity, 'Cantidad por uso');
    if (!itemId || !quantity) continue;
    const normalizedLine = normalizeRecipeLineFlags(line);
    await env.DB.prepare(
      `INSERT INTO stock_recipe_lines (
        tenant_id, recipe_id, item_id, quantity, line_role, client_visible, client_removable,
        client_changeable, is_default, is_optional, is_extra_billable, extra_price, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tenantId,
      recipeId,
      itemId,
      quantity,
      normalizedLine.lineRole,
      normalizedLine.clientVisible,
      normalizedLine.clientRemovable,
      normalizedLine.clientChangeable,
      normalizedLine.isDefault,
      normalizedLine.isOptional,
      normalizedLine.isExtraBillable,
      normalizedLine.extraPrice,
      sort
    ).run();
    sort += 1;
  }
}


const PRODUCT_RECIPE_SHELLS = [
  ['product:panini-jamon-queso', 'Panini jamón y queso'],
  ['product:panini-pizza', 'Panini pizza'],
  ['product:panini-pollo-chipotle', 'Panini pollo chipotle'],
  ['product:panini-pollo-bbq', 'Panini pollo BBQ'],
  ['product:wrap-jamon-queso', 'Wrap jamón y queso'],
  ['product:wrap-pollo-chipotle', 'Wrap pollo chipotle'],
  ['product:wrap-pollo-bbq', 'Wrap pollo BBQ'],
  ['product:wrap-pecas', 'Wrap Pecas'],
  ['product:ensalada-blue', 'Ensalada blue cheese'],
  ['product:ensalada-chipotle', 'Ensalada chipotle'],
  ['product:ensalada-bbq', 'Ensalada BBQ'],
  ['product:ensalada-fresa-nuez', 'Ensalada fresa nuez'],
  ['product:crepa-dulce', 'Crepa dulce'],
  ['product:crepa-salada', 'Crepa salada'],
  ['product:americano', 'Americano'],
  ['product:latte', 'Latte'],
  ['product:frappe', 'Frappé'],
  ['product:coca', 'Coca-Cola'],
  ['product:coca-light', 'Coca-Cola Light'],
  ['product:agua', 'Agua'],
];

async function ensureProductRecipeShells(env) {
  const tenantId = currentTenantId(env);
  if (tenantId !== defaultTenantId(env)) {
    return { created: 0, existing: 0, total: 0 };
  }
  const now = new Date().toISOString();
  let created = 0;
  let existing = 0;
  for (const [recipeKey, name] of PRODUCT_RECIPE_SHELLS) {
    const found = await env.DB.prepare(`SELECT id FROM stock_recipes WHERE tenant_id = ? AND recipe_key = ?`).bind(tenantId, recipeKey).first();
    if (found?.id) {
      existing += 1;
      await env.DB.prepare(
        `UPDATE stock_recipes SET recipe_type = 'product', name = ?, is_active = 1, updated_at_utc = ? WHERE tenant_id = ? AND recipe_key = ?`
      ).bind(name, now, tenantId, recipeKey).run();
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO stock_recipes (recipe_key, recipe_type, name, output_item_id, output_quantity, notes, is_active, created_at_utc, updated_at_utc)
       VALUES (?, 'product', ?, NULL, 0, ?, 1, ?, ?)`
    ).bind(recipeKey, name, 'Receta base pendiente de completar. Se cre? para que aparezca en la descarga de CSV.', now, now).run();
    created += 1;
  }
  return { created, existing, total: PRODUCT_RECIPE_SHELLS.length };
}

async function seedRecipeDefaults(env) {
  const shellReport = await ensureProductRecipeShells(env);
  const errors = [];
  const defaults = [
    {
      recipe_key: 'subrecipe:aderezo-chipotle', recipe_type: 'subrecipe', name: 'Aderezo chipotle', outputName: 'Aderezo chipotle preparado', output_quantity: 850,
      lines: [
        ['Mayonesa', 500, 'ingrediente', 0, 0, 0], ['Chipotle', 100, 'ingrediente', 0, 0, 0], ['Mostaza', 40, 'ingrediente', 0, 0, 0], ['Catsup', 60, 'ingrediente', 0, 0, 0], ['Leche entera', 150, 'ingrediente', 0, 0, 0]
      ]
    },
    {
      recipe_key: 'subrecipe:blue-cheese', recipe_type: 'subrecipe', name: 'Blue cheese de la casa', outputName: 'Blue cheese de la casa', output_quantity: 850,
      lines: [['Mayonesa', 500, 'ingrediente', 0, 0, 0], ['Leche entera', 150, 'ingrediente', 0, 0, 0]]
    },

    // Paninis
    { recipe_key: 'product:panini-jamon-queso', recipe_type: 'product', name: 'Panini jamón y queso', lines: [['Pan chapata', 1, 'ingrediente', 0, 0, 0], ['Jamón de pavo', 60, 'ingrediente', 1, 1, 0], ['Queso manchego', 40, 'ingrediente', 1, 1, 0], ['Mayonesa', 15, 'aderezo_interno', 1, 0, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Aluminio / papel', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:panini-pizza', recipe_type: 'product', name: 'Panini pizza', lines: [['Pan chapata', 1, 'ingrediente', 0, 0, 0], ['Pepperoni', 45, 'ingrediente', 1, 1, 0], ['Queso manchego', 40, 'ingrediente', 1, 1, 0], ['Salsa de tomate', 30, 'aderezo_interno', 1, 0, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Aluminio / papel', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:panini-pollo-chipotle', recipe_type: 'product', name: 'Panini pollo chipotle', lines: [['Pan chapata', 1, 'ingrediente', 0, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 40, 'ingrediente', 1, 1, 0], ['Aderezo chipotle preparado', 35, 'aderezo_interno', 1, 0, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Aluminio / papel', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:panini-pollo-bbq', recipe_type: 'product', name: 'Panini pollo BBQ', lines: [['Pan chapata', 1, 'ingrediente', 0, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 40, 'ingrediente', 1, 1, 0], ['Salsa BBQ', 35, 'aderezo_interno', 1, 0, 0], ['Cebolla caramelizada', 15, 'ingrediente', 1, 1, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Aluminio / papel', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },

    // Wraps
    { recipe_key: 'product:wrap-jamon-queso', recipe_type: 'product', name: 'Wrap jamón y queso', lines: [['Tortilla wrap', 1, 'ingrediente', 0, 0, 0], ['Jamón de pavo', 60, 'ingrediente', 1, 1, 0], ['Lechuga', 60, 'ingrediente', 1, 1, 0], ['Queso manchego', 35, 'ingrediente', 1, 1, 0], ['Mayonesa', 15, 'aderezo_interno', 1, 0, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:wrap-pollo-chipotle', recipe_type: 'product', name: 'Wrap pollo chipotle', lines: [['Tortilla wrap', 1, 'ingrediente', 0, 0, 0], ['Lechuga', 60, 'ingrediente', 1, 1, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 35, 'ingrediente', 1, 1, 0], ['Aderezo chipotle preparado', 30, 'aderezo_interno', 1, 0, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:wrap-pollo-bbq', recipe_type: 'product', name: 'Wrap pollo BBQ', lines: [['Tortilla wrap', 1, 'ingrediente', 0, 0, 0], ['Lechuga', 60, 'ingrediente', 1, 1, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 35, 'ingrediente', 1, 1, 0], ['Salsa BBQ', 30, 'aderezo_interno', 1, 0, 0], ['Cebolla caramelizada', 15, 'ingrediente', 1, 1, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:wrap-pecas', recipe_type: 'product', name: 'Wrap Pecas', lines: [['Tortilla wrap', 1, 'ingrediente', 0, 0, 0], ['Lechuga', 60, 'ingrediente', 1, 1, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Blue cheese de la casa', 30, 'aderezo_interno', 1, 0, 0], ['Queso mozzarella', 25, 'ingrediente', 1, 1, 0], ['Queso manchego', 25, 'ingrediente', 1, 1, 0], ['Bolsa panini', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0]] },

    // Ensaladas
    { recipe_key: 'product:ensalada-blue', recipe_type: 'product', name: 'Ensalada blue cheese', lines: [['Empaque ensalada', 1, 'empaque', 0, 0, 0], ['Lechuga', 120, 'ingrediente', 1, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 30, 'ingrediente', 1, 1, 0], ['Crutones', 20, 'ingrediente', 1, 1, 0], ['Blue cheese de la casa', 40, 'aderezo_acompanamiento', 1, 0, 0], ['Contenedor aderezo', 1, 'empaque', 0, 0, 0], ['Cubiertos', 1, 'cubiertos', 1, 0, 0]] },
    { recipe_key: 'product:ensalada-chipotle', recipe_type: 'product', name: 'Ensalada chipotle', lines: [['Empaque ensalada', 1, 'empaque', 0, 0, 0], ['Lechuga', 120, 'ingrediente', 1, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 30, 'ingrediente', 1, 1, 0], ['Aderezo chipotle preparado', 40, 'aderezo_acompanamiento', 1, 0, 0], ['Contenedor aderezo', 1, 'empaque', 0, 0, 0], ['Cubiertos', 1, 'cubiertos', 1, 0, 0]] },
    { recipe_key: 'product:ensalada-bbq', recipe_type: 'product', name: 'Ensalada BBQ', lines: [['Empaque ensalada', 1, 'empaque', 0, 0, 0], ['Lechuga', 120, 'ingrediente', 1, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Queso manchego', 30, 'ingrediente', 1, 1, 0], ['Salsa BBQ', 40, 'aderezo_acompanamiento', 1, 0, 0], ['Cebolla caramelizada', 15, 'ingrediente', 1, 1, 0], ['Contenedor aderezo', 1, 'empaque', 0, 0, 0], ['Cubiertos', 1, 'cubiertos', 1, 0, 0]] },
    { recipe_key: 'product:ensalada-fresa-nuez', recipe_type: 'product', name: 'Ensalada fresa nuez', lines: [['Empaque ensalada', 1, 'empaque', 0, 0, 0], ['Lechuga', 120, 'ingrediente', 1, 0, 0], ['Pollo', 100, 'ingrediente', 1, 1, 0], ['Fresa', 50, 'ingrediente', 1, 1, 0], ['Nuez', 15, 'ingrediente', 1, 1, 0], ['Queso manchego', 30, 'ingrediente', 1, 1, 0], ['Ensalada italiana', 40, 'aderezo_acompanamiento', 1, 0, 0], ['Contenedor aderezo', 1, 'empaque', 0, 0, 0], ['Cubiertos', 1, 'cubiertos', 1, 0, 0]] },

    // Crepas
    {
      recipe_key: 'product:crepa-dulce', recipe_type: 'product', name: 'Crepa dulce',
      lines: [
        ['Masa crepa', 120, 'ingrediente', 0, 0, 0], ['Contenedor crepa', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0],
        ['Nutella', 35, 'ingrediente', 1, 1, 10], ['Cajeta', 35, 'ingrediente', 1, 1, 10], ['Lechera', 30, 'ingrediente', 1, 1, 10], ['Queso crema', 35, 'ingrediente', 1, 1, 10],
        ['Fresa', 40, 'ingrediente', 1, 1, 10], ['Plátano', 50, 'ingrediente', 1, 1, 10], ['Nuez', 15, 'ingrediente', 1, 1, 10]
      ]
    },
    {
      recipe_key: 'product:crepa-salada', recipe_type: 'product', name: 'Crepa salada',
      lines: [
        ['Masa crepa', 120, 'ingrediente', 0, 0, 0], ['Contenedor crepa', 1, 'empaque', 0, 0, 0], ['Sticker', 1, 'empaque', 0, 0, 0],
        ['Jamón de pavo', 60, 'ingrediente', 1, 1, 10], ['Pepperoni', 45, 'ingrediente', 1, 1, 10], ['Queso manchego', 40, 'ingrediente', 1, 1, 10], ['Queso mozzarella', 40, 'ingrediente', 1, 1, 10], ['Mix quesos', 40, 'ingrediente', 1, 1, 10]
      ]
    },

    // Café y bebidas
    { recipe_key: 'product:americano', recipe_type: 'product', name: 'Americano', lines: [['Café', 18, 'ingrediente', 0, 0, 0], ['Vaso café', 1, 'empaque', 0, 0, 0], ['Tapa café', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:latte', recipe_type: 'product', name: 'Latte', lines: [['Café', 18, 'ingrediente', 0, 0, 0], ['Leche entera', 250, 'ingrediente', 1, 1, 0], ['Leche deslactosada', 250, 'ingrediente', 1, 1, 0], ['Vaso café', 1, 'empaque', 0, 0, 0], ['Tapa café', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:frappe', recipe_type: 'product', name: 'Frappé', lines: [['Café', 18, 'ingrediente', 0, 0, 0], ['Leche entera', 250, 'ingrediente', 1, 1, 0], ['Leche deslactosada', 250, 'ingrediente', 1, 1, 0], ['Hielo en bolsa', 0.1, 'hielo', 0, 0, 0], ['Vaso café', 1, 'empaque', 0, 0, 0], ['Tapa café', 1, 'empaque', 0, 0, 0], ['Popote', 1, 'empaque', 0, 0, 0]] },
    { recipe_key: 'product:coca', recipe_type: 'product', name: 'Coca-Cola', lines: [['Coca Cola regular', 1, 'ingrediente', 0, 0, 0]] },
    { recipe_key: 'product:coca-light', recipe_type: 'product', name: 'Coca-Cola Light', lines: [['Coca sin azúcar', 1, 'ingrediente', 0, 0, 0]] },
    { recipe_key: 'product:agua', recipe_type: 'product', name: 'Agua', lines: [['Aguas', 1, 'ingrediente', 0, 0, 0]] },
  ];

  let saved = 0;
  for (const def of defaults) {
    try {
      const outputItemId = def.outputName ? await getItemIdByName(env, def.outputName) : null;
      const lines = [];
      for (const [itemName, quantity, role, clientVisible = 0, optional = 0, extraPrice = 0] of def.lines) {
        const itemId = await getItemIdByName(env, itemName);
        if (!itemId) continue;
        lines.push({
          item_id: itemId,
          quantity,
          line_role: role,
          client_visible: Boolean(clientVisible),
          client_removable: role === 'ingrediente' && Boolean(clientVisible) && !optional,
          client_changeable: role === 'aderezo_interno',
          is_default: !optional,
          is_optional: Boolean(optional),
          is_extra_billable: Boolean(extraPrice),
          extra_price: extraPrice,
        });
      }
      await saveRecipe(env, { ...def, output_item_id: outputItemId, lines, is_active: true, notes: lines.length ? 'Base editable generada automáticamente.' : 'Receta base creada sin líneas porque faltan ingredientes en inventario. Completar desde CSV.' });
      saved += 1;
    } catch (error) {
      errors.push(`${def.recipe_key}: ${error.message}`);
    }
  }
  const finalShellReport = await ensureProductRecipeShells(env);
  return { shellReport, finalShellReport, saved, errors };
}

function truthy(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 's?', 'si', 'yes', 'y', 'x'].includes(normalized);
}

async function importRecipes(env, rows, mode = 'upsert') {
  const grouped = new Map();
  let skipped = 0;

  for (const row of rows || []) {
    const recipeKey = String(row.recipe_key || '').trim();
    const name = String(row.recipe_name || row.name || '').trim();
    if (!recipeKey || !name) {
      skipped += 1;
      continue;
    }

    if (!grouped.has(recipeKey)) {
      grouped.set(recipeKey, {
        recipe_key: recipeKey,
        recipe_type: String(row.recipe_type || 'product').trim() || 'product',
        name,
        outputName: String(row.output_item_name || '').trim(),
        output_quantity: Number(row.output_quantity || 0),
        notes: row.notes || '',
        is_active: true,
        lines: [],
      });
    }

    const ingredientName = String(row.ingredient_name || '').trim();
    const quantity = Number(row.quantity || 0);
    // Permite recetas cascar?n descargadas desde el sistema: crean/actualizan la receta sin líneas.
    if (!ingredientName && !quantity) continue;
    if (!ingredientName || !quantity) {
      skipped += 1;
      continue;
    }

    grouped.get(recipeKey).lines.push({
      ingredientName,
      quantity,
      line_role: cleanRecipeLineRole(row.line_role),
      client_visible: truthy(row.client_visible),
      client_removable: truthy(row.client_removable),
      client_changeable: truthy(row.client_changeable),
      is_default: truthy(row.is_default),
      is_optional: truthy(row.is_optional),
      is_extra_billable: truthy(row.is_extra_billable),
      extra_price: Number(row.extra_price || 0),
    });
  }

  let imported = 0;
  let updated = 0;

  for (const recipe of grouped.values()) {
    const existing = await env.DB.prepare(`SELECT id FROM stock_recipes WHERE tenant_id = ? AND recipe_key = ?`).bind(currentTenantId(env), recipe.recipe_key).first();
    if (!existing && mode === 'updateOnly') {
      skipped += 1;
      continue;
    }
    const outputItemId = recipe.outputName ? await getItemIdByName(env, recipe.outputName) : null;
    const lines = [];
    for (const line of recipe.lines) {
      const itemId = await getItemIdByName(env, line.ingredientName);
      if (!itemId) {
        skipped += 1;
        continue;
      }
      lines.push({ ...line, item_id: itemId });
    }
    await saveRecipe(env, { ...recipe, id: existing?.id || null, output_item_id: outputItemId, lines });
    if (existing?.id) updated += 1;
    else imported += 1;
  }

  return { imported, updated, skipped };
}

async function produceSubRecipe(env, { recipeId, outputQuantity, note, branchId }, user) {
  const recipe = await env.DB.prepare(`SELECT * FROM stock_recipes WHERE tenant_id = ? AND id = ? AND recipe_type = 'subrecipe'`).bind(currentTenantId(env), Number(recipeId)).first();
  if (!recipe) throw new Error('Sub-receta no encontrada.');
  if (!recipe.output_item_id) throw new Error('La sub-receta necesita un ingrediente de salida.');
  const outputQty = wholeNonNegativeNumber(outputQuantity, 'Cantidad producida');
  if (!outputQty) throw new Error('Cantidad producida inv?lida.');
  const baseOutput = Number(recipe.output_quantity || 0);
  if (!baseOutput) throw new Error('La sub-receta necesita rendimiento base.');
  const factor = outputQty / baseOutput;
  const lines = (await env.DB.prepare(`SELECT * FROM stock_recipe_lines WHERE recipe_id = ? ORDER BY sort_order ASC`).bind(recipe.id).all()).results || [];

  for (const line of lines) {
    const needed = Number(line.quantity || 0) * factor;
    const item = await env.DB.prepare(`SELECT id, name FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), line.item_id).first();
    if (!item) throw new Error('Ingrediente de receta no encontrado.');
    const available = await getBranchStock(env, line.item_id, branchId);
    if (available - needed < 0) throw new Error(`No hay suficiente stock de ${item.name}.`);
  }

  const sourceId = `recipe:${recipe.id}:${Date.now()}`;
  for (const line of lines) {
    const needed = Number(line.quantity || 0) * factor;
    await addMovement(env, { itemId: line.item_id, movementType: 'produccion_consumo', quantity: -needed, reason: note || `Producci?n de ${recipe.name}`, sourceType: 'subrecipe', sourceId, user, branchId });
  }
  await addMovement(env, { itemId: recipe.output_item_id, movementType: 'produccion_salida', quantity: outputQty, reason: note || `Producci?n de ${recipe.name}`, sourceType: 'subrecipe', sourceId, user, branchId });
}


async function submitInventoryCounts(env, rows, reason, user, branchId) {
  const cleaned = [];
  for (const row of rows || []) {
    const itemId = Number(row.itemId || row.id || 0);
    const requestedStock = wholeNonNegativeNumber(row.current_stock, 'Conteo de inventario');
    if (!itemId || !Number.isFinite(requestedStock) || requestedStock < 0) continue;
    const item = await env.DB.prepare(`SELECT id, name FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), itemId).first();
    if (!item) continue;
    const currentStock = await getBranchStock(env, itemId, branchId);
    const diff = requestedStock - currentStock;
    if (Math.abs(diff) < 0.000001) continue;
    cleaned.push({ itemId, requestedStock, currentStock, diff, itemName: item.name });
  }

  if (cleaned.length === 0) return { direct: user.role === 'admin', count: 0 };

  const note = String(reason || 'Conteo de inventario').trim() || 'Conteo de inventario';

  if (user.role === 'admin') {
    for (const row of cleaned) {
      await addMovement(env, {
        itemId: row.itemId,
        movementType: 'ajuste_inventario',
        quantity: row.diff,
        reason: note,
        sourceType: 'inventory_count_direct',
        user,
        approvedBy: user.name,
        branchId,
      });
    }
    return { direct: true, count: cleaned.length };
  }

  const ts = getTimestamps();
  for (const row of cleaned) {
    await env.DB.prepare(
      `INSERT INTO inventory_count_requests (
        item_id, requested_stock, current_stock_snapshot, difference, reason, status,
        reported_by, reported_role, reported_shift, branch_id, branch_name,
        created_at_utc, created_at_monterrey, updated_at_utc, updated_at_monterrey
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.itemId, row.requestedStock, row.currentStock, row.diff, note, user.name, user.role, user.shift, branchId, null, ts.utc, ts.monterrey, ts.utc, ts.monterrey).run();
  }
  return { direct: false, count: cleaned.length };
}

async function resolveInventoryCount(env, requestId, approve, adminUser) {
  const request = await env.DB.prepare(`SELECT * FROM inventory_count_requests WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), requestId).first();
  if (!request) throw new Error('Conteo no encontrado.');
  if (request.status !== 'pending') throw new Error('El conteo ya fue procesado.');
  const ts = getTimestamps();

  if (!approve) {
    await env.DB.prepare(
      `UPDATE inventory_count_requests SET status = 'rejected', approved_by = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
    ).bind(adminUser.name, ts.utc, ts.monterrey, currentTenantId(env), requestId).run();
    return;
  }

  const item = await env.DB.prepare(`SELECT id, name FROM inventory_items WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), request.item_id).first();
  if (!item) throw new Error('Ingrediente no encontrado.');
  const currentStock = await getBranchStock(env, request.item_id, request.branch_id || 'dominio');
  const requestedStock = wholeNonNegativeNumber(request.requested_stock, 'Conteo de inventario');
  const diff = requestedStock - currentStock;
  if (Math.abs(diff) > 0.000001) {
    await addMovement(env, {
      itemId: request.item_id,
      movementType: 'ajuste_inventario_aprobado',
      quantity: diff,
      reason: request.reason || 'Conteo de inventario aprobado',
      sourceType: 'inventory_count_request',
      sourceId: String(requestId),
      user: { name: request.reported_by, role: request.reported_role, shift: request.reported_shift },
      approvedBy: adminUser.name,
      branchId: request.branch_id || 'dominio',
      branchName: request.branch_name || null,
    });
  }
  await env.DB.prepare(
    `UPDATE inventory_count_requests SET status = 'approved', approved_by = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
  ).bind(adminUser.name, ts.utc, ts.monterrey, currentTenantId(env), requestId).run();
}


function sanitizeStockPayloadForUser(data, user) {
  if (user.role === 'admin') return data;
  const branchSettings = hideBranchPasswords(data.branchSettings || data.menuSettings?.branchSettings || DEFAULT_BRANCH_SETTINGS);
  const menuSettings = { ...(data.menuSettings || {}), branchSettings };
  return { ...data, branchSettings, menuSettings };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    env.__tenantId = await resolveTenantId(request, env);
    const user = await auth(request, env);
    if (!user.ok) return jsonResponse({ ok: false, error: user.error }, 401);
    await ensureSchema(env);
    await ensureLookupDefaults(env);
    const data = await listData(env, new URL(request.url).searchParams.get('branch'));
    return jsonResponse({ ok: true, role: user.role, accessScope: user.accessScope || 'legacy', lockedBranchId: user.lockedBranchId || null, ...sanitizeStockPayloadForUser(data, user) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar stock.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    // CORREGIDO: antes se llamaba a auth()/authFromValues() ANTES de fijar
    // env.__tenantId, por lo que la validación de PIN de sucursal se hacía
    // contra el tenant equivocado (el default, no el del hostname real).
    env.__tenantId = await resolveTenantId(request, env);
    const body = await request.json();
    const user = body.auth ? await authFromValues(body.auth, env, request) : await auth(request, env);
    if (!user.ok) return jsonResponse({ ok: false, error: user.error }, 401);
    await ensureSchema(env);
    await ensureLookupDefaults(env);
    const requestedBranchId = user.lockedBranchId || body.branchId || body.branch_id || body.selectedBranchId;
    const branchContext = await resolveBranch(env, requestedBranchId);
    const actionBranchId = branchContext.branchId;

    if (body.action === 'list') {
      const data = await listData(env, actionBranchId);
      return jsonResponse({ ok: true, role: user.role, accessScope: user.accessScope || 'legacy', lockedBranchId: user.lockedBranchId || null, ...sanitizeStockPayloadForUser(data, user) });
    }

    if (body.action === 'seedDefaults') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede crear cat?logo base.' }, 403);
      await seedDefaults(env);
      await seedOptionFamilies(env);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'saveItem') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede editar ingredientes.' }, 403);
      await saveItem(env, body.item || {});
      return jsonResponse({ ok: true });
    }

    if (body.action === 'bulkUpdateItems') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede editar inventario r?pido.' }, 403);
      await updateQuickItems(env, body.items || [], user, actionBranchId);
      return jsonResponse({ ok: true });
    }


    if (body.action === 'submitInventoryCounts') {
      const result = await submitInventoryCounts(env, body.items || [], body.reason || '', user, actionBranchId);
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === 'approveInventoryCount' || body.action === 'rejectInventoryCount') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede aprobar conteos de inventario.' }, 403);
      const requestId = Number(body.requestId);
      if (!requestId) return jsonResponse({ ok: false, error: 'Falta conteo.' }, 400);
      await resolveInventoryCount(env, requestId, body.action === 'approveInventoryCount', user);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'importItems') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede importar CSV.' }, 403);
      const result = await importItems(env, body.rows || [], body.mode || 'upsert', user, actionBranchId);
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === 'seedRecipeDefaults') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede crear recetas base.' }, 403);
      const result = await seedRecipeDefaults(env);
      await seedOptionFamilies(env);
      return jsonResponse({ ok: true, result });
    }

    if (body.action === 'saveRecipe') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede editar recetas.' }, 403);
      await saveRecipe(env, body.recipe || {});
      return jsonResponse({ ok: true });
    }

    if (body.action === 'archiveRecipe' || body.action === 'restoreRecipe') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede archivar recetas.' }, 403);
      await archiveRecipe(env, body.recipeId, body.action === 'archiveRecipe');
      return jsonResponse({ ok: true });
    }

    if (body.action === 'saveCatalogProduct') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede editar productos.' }, 403);
      const product = await saveCatalogProduct(env, body.product || {});
      return jsonResponse({ ok: true, product });
    }

    if (body.action === 'saveOptionFamily') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede editar familias.' }, 403);
      await saveOptionFamily(env, body.family || {});
      return jsonResponse({ ok: true });
    }

    if (body.action === 'removeProductFamilyRule') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede quitar familias de productos.' }, 403);
      await removeProductFamilyRule(env, body || {});
      return jsonResponse({ ok: true });
    }

    if (body.action === 'seedOptionFamilies') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede crear familias.' }, 403);
      await seedOptionFamilies(env);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'validateOptionFamilies') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Solo admin puede validar familias.' }, 403);
      const errors = await validateFamilyImportRows(env, body.rows || []);
      return jsonResponse({ ok: errors.length === 0, errors });
    }

    if (body.action === 'importOptionFamilies') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede importar familias.' }, 403);
      const result = await importOptionFamilies(env, body.rows || [], body.mode || 'upsert');
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === 'importRecipes') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede importar recetas.' }, 403);
      const result = await importRecipes(env, body.rows || [], body.mode || 'upsert');
      return jsonResponse({ ok: true, ...result });
    }

    if (body.action === 'produceSubRecipe') {
      await produceSubRecipe(env, { ...body, branchId: actionBranchId }, user);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'setProductSoldOut') {
      if (!body.productId) return jsonResponse({ ok: false, error: 'Falta producto.' }, 400);
      await setProductSoldOut(env, String(body.productId), Boolean(body.soldOut), actionBranchId);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'receiveStock') {
      await addMovement(env, {
        itemId: Number(body.itemId),
        movementType: 'entrada_compra',
        quantity: wholeNonNegativeNumber(body.quantity, 'Cantidad a sumar'),
        reason: body.note || 'Entrada de compra',
        sourceType: 'manual',
        user,
        branchId: actionBranchId,
      });
      return jsonResponse({ ok: true });
    }

    if (body.action === 'reportWaste') {
      const itemId = Number(body.itemId);
      const quantity = wholeNonNegativeNumber(body.quantity, 'Cantidad a descontar');
      const reason = (body.reason || '').trim();
      if (!itemId || !quantity || !reason) return jsonResponse({ ok: false, error: 'La merma necesita ingrediente, cantidad y raz?n.' }, 400);

      if (user.role === 'admin') {
        await addMovement(env, {
          itemId,
          movementType: 'merma_directa',
          quantity: -quantity,
          reason,
          sourceType: 'waste_direct',
          user,
          approvedBy: user.name,
          branchId: actionBranchId,
        });
        return jsonResponse({ ok: true, mode: 'direct' });
      }

      const ts = getTimestamps();
      await env.DB.prepare(
        `INSERT INTO waste_requests (
          item_id, quantity, reason, status, reported_by, reported_role, reported_shift, branch_id, branch_name,
          created_at_utc, created_at_monterrey, updated_at_utc, updated_at_monterrey
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(itemId, quantity, reason, user.name, user.role, user.shift, actionBranchId, branchContext.branchName, ts.utc, ts.monterrey, ts.utc, ts.monterrey).run();
      return jsonResponse({ ok: true, mode: 'pending' });
    }

    if (body.action === 'approveWaste' || body.action === 'rejectWaste') {
      if (!requireAdmin(user)) return jsonResponse({ ok: false, error: 'Solo admin puede aprobar o rechazar mermas.' }, 403);
      const requestId = Number(body.requestId);
      const waste = await env.DB.prepare(`SELECT * FROM waste_requests WHERE tenant_id = ? AND id = ?`).bind(currentTenantId(env), requestId).first();
      if (!waste) return jsonResponse({ ok: false, error: 'Merma no encontrada.' }, 404);
      if (waste.status !== 'pending') return jsonResponse({ ok: false, error: 'La merma ya fue procesada.' }, 400);
      const ts = getTimestamps();

      if (body.action === 'rejectWaste') {
        await env.DB.prepare(
          `UPDATE waste_requests SET status = 'rejected', approved_by = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
        ).bind(user.name, ts.utc, ts.monterrey, currentTenantId(env), requestId).run();
        return jsonResponse({ ok: true });
      }

      await addMovement(env, {
        itemId: waste.item_id,
        movementType: 'merma_aprobada',
        quantity: -wholeNonNegativeNumber(waste.quantity, 'Cantidad a descontar'),
        reason: waste.reason,
        sourceType: 'waste_request',
        sourceId: String(requestId),
        user: { name: waste.reported_by, role: waste.reported_role, shift: waste.reported_shift },
        approvedBy: user.name,
        branchId: waste.branch_id || actionBranchId,
        branchName: waste.branch_name || branchContext.branchName,
      });
      await env.DB.prepare(
        `UPDATE waste_requests SET status = 'approved', approved_by = ?, updated_at_utc = ?, updated_at_monterrey = ? WHERE tenant_id = ? AND id = ?`
      ).bind(user.name, ts.utc, ts.monterrey, currentTenantId(env), requestId).run();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'Acci?n inv?lida.' }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.validationErrors ? 'El archivo tiene errores de validación.' : 'No se pudo procesar stock.', detail: error.message, validationErrors: error.validationErrors || [] }, error.validationErrors ? 400 : 500);
  }
}





