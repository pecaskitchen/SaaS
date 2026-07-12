import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [{ id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' }],
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

function resolveBranch(settings, requested = {}) {
  const id = normalizeBranchId(requested.id || requested.branchId || requested, settings.defaultBranchId);
  const activeBranches = (settings.branches || []).filter((branch) => branch.active !== false);
  return activeBranches.find((branch) => branch.id === id)
    || activeBranches.find((branch) => branch.id === settings.defaultBranchId)
    || activeBranches[0]
    || settings.branches?.[0]
    || DEFAULT_BRANCH_SETTINGS.branches[0];
}

function getTimestamps() {
  const now = new Date();
  const monterreyTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Monterrey',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(now);
  return { utc: now.toISOString(), monterrey: monterreyTime };
}

async function ensureSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      order_number TEXT NOT NULL UNIQUE,
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
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order ON order_items(tenant_id, order_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_events_tenant_order ON order_events(tenant_id, order_id)`).run();
  await ensureTenantColumns(env, ['orders', 'order_items', 'order_events']);

  const info = await env.DB.prepare(`PRAGMA table_info(orders)`).all();
  const columns = new Set((info.results || []).map((row) => row.name));
  const alters = [];
  if (!columns.has('branch_id')) alters.push(`ALTER TABLE orders ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'dominio'`);
  if (!columns.has('branch_name')) alters.push(`ALTER TABLE orders ADD COLUMN branch_name TEXT NOT NULL DEFAULT 'Dominio'`);
  if (!columns.has('stock_deducted')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has('stock_deducted_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted_at_utc TEXT`);
  if (!columns.has('stock_deducted_at_monterrey')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deducted_at_monterrey TEXT`);
  if (!columns.has('stock_deduction_error')) alters.push(`ALTER TABLE orders ADD COLUMN stock_deduction_error TEXT`);
  if (!columns.has('order_source')) alters.push(`ALTER TABLE orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'online'`);
  if (!columns.has('cashier_name')) alters.push(`ALTER TABLE orders ADD COLUMN cashier_name TEXT`);
  if (!columns.has('cashier_shift')) alters.push(`ALTER TABLE orders ADD COLUMN cashier_shift TEXT`);
  if (!columns.has('payment_method')) alters.push(`ALTER TABLE orders ADD COLUMN payment_method TEXT`);
  if (!columns.has('payment_status')) alters.push(`ALTER TABLE orders ADD COLUMN payment_status TEXT`);
  for (const sql of alters) await env.DB.prepare(sql).run();
}

async function nextOrderNumber(env, branch, tenantId) {
  const prefix = String(branch?.id || 'pecas').slice(0, 3).toUpperCase();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders WHERE tenant_id = ? AND branch_id = ?`).bind(tenantId, branch.id).first();
  return `${prefix}-${String(Number(row?.count || 0) + 1).padStart(4, '0')}`;
}


function resolveCashierAccess(settings, password) {
  const clean = String(password || '').trim();
  if (!clean) return { ok: false, error: 'Ingresa contraseÃ±a de caja.' };
  if (settings && Array.isArray(settings.branches)) {
    const branch = settings.branches.find((item) => item.active !== false && item.cashierPassword && item.cashierPassword === clean);
    if (branch) return { ok: true, branch };
  }
  return { ok: false, error: 'ContraseÃ±a de caja invÃ¡lida.' };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    await ensureSchema(env);
    const tenantId = await resolveTenantId(request, env);

    const body = await request.json();
    const source = body.source === 'cashier' ? 'cashier' : 'online';
    const customer = body.customer || {};
    if (source === 'online' && (!customer.name || !customer.address)) return jsonResponse({ ok: false, error: 'Faltan datos del cliente.' }, 400);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return jsonResponse({ ok: false, error: 'El pedido estÃ¡ vacÃ­o.' }, 400);

    const settings = await readBranchSettings(env, tenantId);
    let branch = resolveBranch(settings, body.branch || { id: body.branchId, name: body.branchName });
    let cashier = { name: '', shift: '' };
    if (source === 'cashier') {
      const cashierAuth = body.cashierAuth || {};
      const access = resolveCashierAccess(settings, cashierAuth.password);
      if (!access.ok) return jsonResponse({ ok: false, error: access.error }, 401);
      branch = access.branch;
      cashier = { name: String(cashierAuth.name || '').trim(), shift: String(cashierAuth.shift || '').trim() };
      body.paymentMethod = String(body.paymentMethod || 'efectivo').trim();
      body.paymentStatus = String(body.paymentStatus || 'paid').trim();
      if (!cashier.name) return jsonResponse({ ok: false, error: 'Ingresa nombre del cajero.' }, 400);
    }
    const timestamps = getTimestamps();
    let orderNumber = await nextOrderNumber(env, branch, tenantId);

    let createdOrder = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await env.DB.prepare(`
          INSERT INTO orders (
            tenant_id, order_number, status, branch_id, branch_name, order_source, cashier_name, cashier_shift, customer_name, customer_phone, customer_address, customer_notes, payment_method, payment_status,
            subtotal, delivery_fee, total, whatsapp_message, created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
        `).bind(
          tenantId,
          orderNumber,
          'pending',
          branch.id,
          branch.name,
          source,
          cashier.name || null,
          cashier.shift || null,
          String(customer.name || (source === 'cashier' ? 'Cliente caja' : '')).trim(),
          String(customer.phone || '').trim(),
          String(customer.address || (source === 'cashier' ? 'Caja' : '')).trim(),
          String(customer.notes || '').trim(),
          source === 'cashier' ? String(body.paymentMethod || 'efectivo') : null,
          source === 'cashier' ? String(body.paymentStatus || 'paid') : null,
          Number(body.subtotal || 0),
          Number(body.deliveryFee || 0),
          Number(body.total || 0),
          String(body.whatsappMessage || ''),
          timestamps.utc,
          timestamps.monterrey,
          timestamps.utc,
          timestamps.monterrey
        ).run();
        createdOrder = { id: result.meta.last_row_id };
        break;
      } catch (error) {
        if (!String(error.message || '').includes('UNIQUE')) throw error;
        orderNumber = `${String(branch.id || 'pecas').slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-6)}-${attempt + 1}`;
      }
    }

    if (!createdOrder?.id) return jsonResponse({ ok: false, error: 'No se pudo crear el pedido.' }, 500);

    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO order_items (
          tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes, created_at_utc, created_at_monterrey
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tenantId,
        createdOrder.id,
        String(item.id || item.productId || ''),
        String(item.name || 'Producto'),
        String(item.category || 'Sin categorÃ­a'),
        Number(item.quantity || 1),
        Number(item.price || item.unitPrice || 0),
        Number(item.lineTotal || (Number(item.price || item.unitPrice || 0) * Number(item.quantity || 1))),
        JSON.stringify(item.options || {}),
        String(item.notes || ''),
        timestamps.utc,
        timestamps.monterrey
      ).run();
    }

    await env.DB.prepare(`
      INSERT INTO order_events (tenant_id, order_id, event_type, event_note, created_at_utc, created_at_monterrey)
      VALUES (?, ?, 'created', ?, ?, ?)
    `).bind(tenantId, createdOrder.id, source === 'cashier' ? `Pedido de caja creado por ${cashier.name} para sucursal ${branch.name}` : `Pedido creado para sucursal ${branch.name}`, timestamps.utc, timestamps.monterrey).run();

    return jsonResponse({ ok: true, orderId: createdOrder.id, orderNumber, branch });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar el pedido.', detail: error.message }, 500);
  }
}

