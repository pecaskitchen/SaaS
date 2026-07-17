import { requireAuth } from './_shared/auth.js';
import { upsertCustomerFromOrder } from './_shared/crm.js';
import { ensureTenantColumns, resolveTenantId, tenantSettingKey } from './_shared/tenant.js';
import { DEFAULT_BRANCH_SETTINGS, normalizeBranchId, normalizeBranchSettings, normalizeCashierOrderSources } from './_shared/branchSettings.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

// Cacheado a nivel de modulo -- se llama en cada creacion/lectura de
// pedido; una vez verificado en este isolate no hace falta repetir los
// CREATE TABLE/INDEX/ALTER en cada request.
let ordersSchemaEnsured = false;

export async function ensureSchema(env) {
  if (ordersSchemaEnsured) return;
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
      payment_status TEXT,
      payment_provider TEXT,
      payment_preference_id TEXT,
      provider_payment_id TEXT,
      provider_merchant_order_id TEXT,
      payment_amount INTEGER,
      marketplace_fee INTEGER DEFAULT 0,
      paid_at TEXT
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

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS branch_order_counters (
      tenant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      next_number INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tenant_id, branch_id)
    )
  `).run();

  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_created_at_monterrey ON orders(created_at_monterrey)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at_monterrey)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at_monterrey)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_tenant_order_number ON orders(tenant_id, order_number)`).run();
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
  if (!columns.has('exclude_from_reports')) alters.push(`ALTER TABLE orders ADD COLUMN exclude_from_reports INTEGER NOT NULL DEFAULT 0`);
  if (!columns.has('archived_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN archived_at_utc TEXT`);
  if (!columns.has('archived_reason')) alters.push(`ALTER TABLE orders ADD COLUMN archived_reason TEXT`);
  if (!columns.has('deleted_at_utc')) alters.push(`ALTER TABLE orders ADD COLUMN deleted_at_utc TEXT`);
  // Antes solo las creaba ensurePaymentTables() (payments.js) -- un pedido
  // creado por WhatsApp/Messenger (que solo llama a este ensureSchema, no
  // al de pagos) en un tenant nuevo que nunca conecto Mercado Pago fallaba
  // con "no such column: payment_provider" al insertar. orders.js es el
  // dueno real de la tabla orders, asi que estas columnas viven aqui.
  if (!columns.has('payment_provider')) alters.push(`ALTER TABLE orders ADD COLUMN payment_provider TEXT`);
  if (!columns.has('payment_preference_id')) alters.push(`ALTER TABLE orders ADD COLUMN payment_preference_id TEXT`);
  if (!columns.has('provider_payment_id')) alters.push(`ALTER TABLE orders ADD COLUMN provider_payment_id TEXT`);
  if (!columns.has('provider_merchant_order_id')) alters.push(`ALTER TABLE orders ADD COLUMN provider_merchant_order_id TEXT`);
  if (!columns.has('payment_amount')) alters.push(`ALTER TABLE orders ADD COLUMN payment_amount INTEGER`);
  if (!columns.has('marketplace_fee')) alters.push(`ALTER TABLE orders ADD COLUMN marketplace_fee INTEGER DEFAULT 0`);
  if (!columns.has('paid_at')) alters.push(`ALTER TABLE orders ADD COLUMN paid_at TEXT`);
  if (!columns.has('custom_fields_json')) alters.push(`ALTER TABLE orders ADD COLUMN custom_fields_json TEXT`);
  for (const sql of alters) await env.DB.prepare(sql).run();
  ordersSchemaEnsured = true;
}

async function nextOrderNumber(env, branch, tenantId) {
  const prefix = String(branch?.id || 'pecas').slice(0, 3).toUpperCase();
  // UPSERT atomico -- un SELECT COUNT(*) + 1 previo podia devolver el
  // mismo numero a dos pedidos creados al mismo tiempo (el INSERT de
  // abajo lo detectaba via el indice UNIQUE y reintentaba con un
  // formato de respaldo, pero el numero "lindo" secuencial se perdia).
  // INSERT ... ON CONFLICT ... RETURNING es una sola sentencia atomica,
  // sin ventana de carrera entre leer y escribir el contador.
  const row = await env.DB.prepare(`
    INSERT INTO branch_order_counters (tenant_id, branch_id, next_number)
    VALUES (?, ?, 1)
    ON CONFLICT(tenant_id, branch_id) DO UPDATE SET next_number = next_number + 1
    RETURNING next_number
  `).bind(tenantId, branch.id).first();
  return `${prefix}-${String(Number(row?.next_number || 1)).padStart(4, '0')}`;
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
    // Campos extra configurables por el tenant (custom1/custom2). Se guardan
    // como JSON estructurado [{key,label,type,value}] para mostrarlos en el
    // detalle del pedido.
    const customFieldsList = Array.isArray(customer.customFields) ? customer.customFields.filter((f) => f && String(f.value ?? '').trim()) : [];
    const customFieldsJson = customFieldsList.length ? JSON.stringify(customFieldsList) : null;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return jsonResponse({ ok: false, error: 'El pedido está vacío.' }, 400);

    const settings = await readBranchSettings(env, tenantId);
    let branch = resolveBranch(settings, body.branch || { id: body.branchId, name: body.branchName });
    let cashier = { name: '', shift: '' };
    let orderSource = 'online';
    if (source === 'cashier') {
      const cashierAuth = body.cashierAuth || {};
      // Solo JWT: se retiro el login por PIN de caja. Crear pedidos de caja
      // exige cuenta individual. Rediseno de roles: 'manager' tambien puede.
      const jwtAccess = await requireAuth(request, env, ['admin', 'manager', 'cashier', 'platform_admin']);
      if (!jwtAccess.ok) {
        return jsonResponse({ ok: false, error: 'Inicia sesion con tu cuenta para crear pedidos de caja.' }, 401);
      }
      branch = resolveBranch(settings, body.branch || { id: body.branchId, name: body.branchName });
      cashier = { name: String(cashierAuth.name || '').trim() || jwtAccess.session.name || jwtAccess.session.email || 'Caja', shift: String(cashierAuth.shift || '').trim() };
      body.paymentMethod = String(body.paymentMethod || 'efectivo').trim();
      body.paymentStatus = String(body.paymentStatus || 'paid').trim();
      const allowedSources = normalizeCashierOrderSources(settings.cashierOrderSources);
      const requestedSource = String(body.orderOrigin || body.orderSource || body.order_source || settings.defaultCashierOrderSource || '').trim();
      orderSource = allowedSources.includes(requestedSource)
        ? requestedSource
        : (allowedSources.includes(settings.defaultCashierOrderSource) ? settings.defaultCashierOrderSource : allowedSources[0]);
      if (!cashier.name) return jsonResponse({ ok: false, error: 'Ingresa nombre del cajero.' }, 400);
    }
    const timestamps = getTimestamps();
    let orderNumber = await nextOrderNumber(env, branch, tenantId);

    let createdOrder = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await env.DB.prepare(`
          INSERT INTO orders (
            tenant_id, order_number, status, branch_id, branch_name, order_source, cashier_name, cashier_shift, customer_name, customer_phone, customer_address, customer_notes, custom_fields_json, payment_method, payment_status,
            subtotal, delivery_fee, total, whatsapp_message, created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
        `).bind(
          tenantId,
          orderNumber,
          'pending',
          branch.id,
          branch.name,
          orderSource,
          cashier.name || null,
          cashier.shift || null,
          String(customer.name || (source === 'cashier' ? 'Cliente caja' : '')).trim(),
          String(customer.phone || '').trim(),
          String(customer.address || (source === 'cashier' ? 'Caja' : '')).trim(),
          String(customer.notes || '').trim(),
          customFieldsJson,
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

    const orderItemsStmt = env.DB.prepare(`
      INSERT INTO order_items (
        tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes, created_at_utc, created_at_monterrey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await env.DB.batch(items.map((item) => orderItemsStmt.bind(
      tenantId,
      createdOrder.id,
      String(item.id || item.productId || ''),
      String(item.name || 'Producto'),
      String(item.category || 'Sin categoría'),
      Number(item.quantity || 1),
      Number(item.price || item.unitPrice || 0),
      Number(item.lineTotal || (Number(item.price || item.unitPrice || 0) * Number(item.quantity || 1))),
      JSON.stringify(item.options || {}),
      String(item.notes || ''),
      timestamps.utc,
      timestamps.monterrey
    )));

    await env.DB.prepare(`
      INSERT INTO order_events (tenant_id, order_id, event_type, event_note, created_at_utc, created_at_monterrey)
      VALUES (?, ?, 'created', ?, ?, ?)
    `).bind(tenantId, createdOrder.id, source === 'cashier' ? `Pedido ${orderSource} capturado por ${cashier.name} para sucursal ${branch.name}` : `Pedido creado para sucursal ${branch.name}`, timestamps.utc, timestamps.monterrey).run();

    await upsertCustomerFromOrder(env, tenantId, {
      customer: {
        ...customer,
        neighborhood: body.neighborhood || customer.neighborhood || '',
        sector: body.sector || customer.sector || '',
      },
      order: {
        id: createdOrder.id,
        orderNumber,
        total: Number(body.total || 0),
        createdAtUtc: timestamps.utc,
      },
    });

    return jsonResponse({ ok: true, orderId: createdOrder.id, orderNumber, branch });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar el pedido.', detail: error.message }, 500);
  }
}

