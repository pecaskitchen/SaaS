import { jsonResponse, readJson, requireDb, nowIso } from '../_shared/http.js';
import { resolveTenantId, tenantSettingKey, ensureTenantColumns } from '../_shared/tenant.js';
import { normalizeSavedMenu, readEffectiveCatalog } from '../_shared/menuCatalog.js';
import { ensurePaymentTables, getValidAccessToken } from '../_shared/payments.js';
import { upsertCustomerFromOrder } from '../_shared/crm.js';
import { ensureSchema } from '../orders.js';

// Recalcula el total completo del lado servidor: precio base, extras de
// familias/opciones, extras de receta legacy y entrega. El navegador solo
// manda la intencion del cliente; el importe cobrado sale de D1.

async function loadTenantPriceList(env, tenantId) {
  await ensureTenantColumns(env, ['app_settings']);
  const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
  const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
  const saved = normalizeSavedMenu(row?.value_json || '');
  const catalog = await readEffectiveCatalog(env, tenantId, saved, { includeRecipeFallback: false });

  const priceById = new Map();
  for (const product of catalog.extraProducts || []) {
    const override = saved.overrides?.[product.id];
    const price = Number(override?.price ?? product.price ?? 0);
    const unavailable = Boolean(override?.unavailable ?? product.unavailable);
    priceById.set(product.id, { id: product.id, price, unavailable, name: override?.name || product.name, category: product.category || 'general', type: product.type || 'custom', recipeId: product.recipeId || null });
  }
  return priceById;
}

function getTimestamps() {
  const utc = nowIso();
  const monterrey = new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' }).replace(' ', 'T');
  return { utc, monterrey };
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanSelectionArray(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item || '').trim()).filter((item) => {
    const clean = normalizeName(item);
    return clean && !['n/a', 'ninguno', 'sin jarabe', 'sin aderezo'].includes(clean);
  });
}

async function loadProductOptionGroups(env, tenantId, productId) {
  try {
    const rows = await env.DB.prepare(`
      SELECT pg.product_id, pg.family_id, pg.label, pg.min_select, pg.max_included, pg.max_total, pg.default_option_name,
             pg.extra_price AS group_extra_price, pg.is_required, f.family_key,
             oi.option_name, oi.extra_price AS option_extra_price
      FROM stock_product_option_groups pg
      JOIN stock_option_families f ON f.id = pg.family_id AND f.tenant_id = pg.tenant_id
      JOIN stock_option_family_items oi ON oi.family_id = f.id AND oi.tenant_id = pg.tenant_id
      WHERE pg.tenant_id = ? AND pg.product_id = ? AND pg.is_active = 1 AND f.is_active = 1 AND oi.is_active = 1
      ORDER BY pg.sort_order ASC, oi.sort_order ASC, oi.id ASC
    `).bind(tenantId, productId).all();
    const groups = new Map();
    for (const row of rows.results || []) {
      if (!groups.has(row.family_key)) {
        groups.set(row.family_key, {
          familyKey: row.family_key,
          minSelect: Number(row.min_select || 0),
          maxIncluded: Number(row.max_included || 0),
          maxTotal: Number(row.max_total || 0),
          extraPrice: Number(row.group_extra_price || 0),
          required: Number(row.is_required || 0) === 1,
          options: new Map(),
        });
      }
      groups.get(row.family_key).options.set(normalizeName(row.option_name), { name: row.option_name, extraPrice: Number(row.option_extra_price || 0) });
    }
    return groups;
  } catch {
    return new Map();
  }
}

function computeOptionGroupExtra(groups, selections = {}) {
  let total = 0;
  const usedFamilyKeys = new Set(groups.keys());
  for (const [familyKey, raw] of Object.entries(selections || {})) {
    const selected = cleanSelectionArray(raw);
    if (!selected.length) continue;
    const group = groups.get(familyKey);
    if (!group) throw Object.assign(new Error(`La familia de opciones "${familyKey}" no existe para este producto.`), { status: 400 });
    if (group.maxTotal > 0 && selected.length > group.maxTotal) throw Object.assign(new Error(`${familyKey}: demasiadas opciones seleccionadas.`), { status: 400 });
    for (let index = 0; index < selected.length; index += 1) {
      const option = group.options.get(normalizeName(selected[index]));
      if (!option) throw Object.assign(new Error(`${familyKey}: opcion invalida "${selected[index]}".`), { status: 400 });
      if (index >= group.maxIncluded) total += Number(option.extraPrice || group.extraPrice || 0);
    }
  }
  for (const group of groups.values()) {
    const selected = cleanSelectionArray(selections?.[group.familyKey]);
    if ((group.required || group.minSelect > 0) && selected.length < Math.max(1, group.minSelect)) throw Object.assign(new Error(`${group.familyKey}: faltan opciones obligatorias.`), { status: 400 });
  }
  return { total, usedFamilyKeys };
}

async function computeRecipeExtraPrice(env, tenantId, productId, recipeId, selectedExtras = []) {
  const selected = cleanSelectionArray(selectedExtras);
  if (!selected.length) return 0;
  const rows = await env.DB.prepare(`
    SELECT i.name, l.extra_price
    FROM menu_products p
    JOIN recipes r ON r.tenant_id = p.tenant_id AND r.id = COALESCE(p.recipe_id, ?)
    JOIN recipe_lines l ON l.tenant_id = r.tenant_id AND l.recipe_id = r.id
    JOIN items i ON i.tenant_id = l.tenant_id AND i.id = l.item_id
    WHERE p.tenant_id = ? AND p.product_key = ? AND l.is_extra_billable = 1
  `).bind(Number(recipeId || 0), tenantId, productId).all().then((result) => result.results || []).catch(() => []);
  const byName = new Map(rows.map((row) => [normalizeName(row.name), Number(row.extra_price || 0)]));
  let total = 0;
  for (const extra of selected) {
    const key = normalizeName(extra);
    if (!byName.has(key)) throw Object.assign(new Error(`Extra no valido para este producto: ${extra}`), { status: 400 });
    total += byName.get(key);
  }
  return total;
}

function computeLegacyExtraPrice(product, options = {}, familyKeys = new Set()) {
  let total = 0;
  if ((product.type === 'panini' || product.type === 'wrap' || product.type === 'salad') && !familyKeys.has('aderezos-acompanamiento') && cleanSelectionArray(options.extraDressing).length) total += 10;
  if (product.type === 'crepe' && !familyKeys.has('toppings-dulces')) total += cleanSelectionArray(options.extraToppings || []).length * 10;
  if (product.type === 'coffee' && !familyKeys.has('jarabes') && cleanSelectionArray(options.syrup).length) total += 10;
  if (product.id === 'frappe' && options.whippedCream) total += 10;
  return total;
}

async function recalculateLineItem(env, tenantId, requested, catalogEntry) {
  const quantity = Math.max(1, Math.floor(Number(requested.quantity || 1)));
  const options = requested.options || {};
  const groups = await loadProductOptionGroups(env, tenantId, catalogEntry.id);
  const groupPrice = computeOptionGroupExtra(groups, options.optionGroups || {});
  const recipeExtraPrice = await computeRecipeExtraPrice(env, tenantId, catalogEntry.id, catalogEntry.recipeId, options.recipeExtras || []);
  const legacyExtraPrice = computeLegacyExtraPrice(catalogEntry, options, groupPrice.usedFamilyKeys);
  const unitPrice = Math.max(0, Math.round(Number(catalogEntry.price || 0) + groupPrice.total + recipeExtraPrice + legacyExtraPrice));
  return {
    product_id: catalogEntry.id,
    product_name: catalogEntry.name,
    category: catalogEntry.category,
    quantity,
    unit_price: unitPrice,
    line_total: unitPrice * quantity,
    options,
    notes: String(requested.notes || ''),
  };
}

function resolveDeliveryFee(body, fulfillmentType) {
  if (fulfillmentType !== 'Entrega a domicilio') return 0;
  return Math.max(0, Math.round(Number(body.serverDeliveryFee || 0)));
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    await ensureSchema(env);
    const requestUrl = new URL(request.url);
    const tenantId = await resolveTenantId(request, env);
    await ensurePaymentTables(env);

    const body = await readJson(request);
    const customer = body.customer || {};
    const fulfillmentType = String(body.fulfillmentType || customer.fulfillmentType || '').trim();
    if (!customer.name || !fulfillmentType || (fulfillmentType === 'Entrega a domicilio' && !customer.address)) {
      return jsonResponse({ ok: false, error: 'Faltan datos del cliente.' }, 400);
    }

    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) return jsonResponse({ ok: false, error: 'El pedido esta vacio.' }, 400);

    // 1) Verificar que el tenant tenga pagos en linea conectados ANTES de
    //    crear nada (evita pedidos huerfanos sin forma de pagarse).
    const connection = await env.DB.prepare(
      `SELECT connection_status FROM tenant_payment_connections WHERE tenant_id = ? AND provider = 'mercado_pago'`
    ).bind(tenantId).first();
    if (!connection || connection.connection_status !== 'connected') {
      return jsonResponse({ ok: false, error: 'Este negocio no tiene pagos en linea habilitados.' }, 409);
    }

    // 2) Recalcular precios contra el catalogo real del tenant, incluyendo extras.
    const priceList = await loadTenantPriceList(env, tenantId);
    const lineItems = [];
    let subtotal = 0;
    for (const requested of requestedItems) {
      const productId = String(requested.product_id || requested.id || '').trim();
      const catalogEntry = priceList.get(productId);
      if (!catalogEntry) return jsonResponse({ ok: false, error: `Producto no encontrado: ${productId}` }, 400);
      if (catalogEntry.unavailable) return jsonResponse({ ok: false, error: `${catalogEntry.name} no esta disponible.` }, 409);
      const lineItem = await recalculateLineItem(env, tenantId, requested, catalogEntry);
      subtotal += lineItem.line_total;
      lineItems.push(lineItem);
    }

    const deliveryFee = resolveDeliveryFee(body, fulfillmentType);
    const total = subtotal + deliveryFee;
    if (total <= 0) return jsonResponse({ ok: false, error: 'El total del pedido debe ser mayor a cero.' }, 400);

    // 3) Crear el pedido con status "pending" / payment_status "unpaid" —
    //    se marca "paid" solo cuando el webhook confirma el pago real.
    const timestamps = getTimestamps();
    const orderNumber = `MP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

    const customFieldsList = Array.isArray(customer.customFields) ? customer.customFields.filter((f) => f && String(f.value ?? '').trim()) : [];
    const customFieldsJson = customFieldsList.length ? JSON.stringify(customFieldsList) : null;

    const inserted = await env.DB.prepare(`
      INSERT INTO orders (
        tenant_id, order_number, status, branch_id, branch_name, order_source,
        customer_name, customer_phone, customer_address, customer_neighborhood, customer_notes, custom_fields_json,
        payment_provider, payment_status,
        subtotal, delivery_fee, total, payment_amount,
        created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
      ) VALUES (?, ?, 'pending', ?, ?, 'online', ?, ?, ?, ?, ?, ?, 'mercado_pago', 'unpaid', ?, ?, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
    `).bind(
      tenantId,
      orderNumber,
      String(body.branchId || 'dominio'),
      String(body.branchName || 'Dominio'),
      String(customer.name).trim(),
      String(customer.phone || '').trim(),
      String(customer.address || (fulfillmentType === 'Recoger' ? 'Recoger' : '')).trim(),
      String(customer.neighborhood || body.neighborhood || '').trim(),
      String(customer.notes || body.customerNotes || '').trim(),
      customFieldsJson,
      subtotal,
      deliveryFee,
      total,
      total,
      timestamps.utc,
      timestamps.monterrey,
      timestamps.utc,
      timestamps.monterrey,
    ).run();

    const orderId = inserted.meta.last_row_id;

    await upsertCustomerFromOrder(env, tenantId, {
      customer: {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        neighborhood: customer.neighborhood || body.neighborhood || '',
        sector: customer.sector || body.sector || '',
      },
      order: { id: orderId, orderNumber, total, createdAtUtc: timestamps.utc },
    });

    const orderItemsStmt = env.DB.prepare(`
      INSERT INTO order_items (tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, options_json, item_notes, created_at_utc, created_at_monterrey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await env.DB.batch(lineItems.map((item) => orderItemsStmt.bind(
      tenantId, orderId, item.product_id, item.product_name, item.category, item.quantity, item.unit_price, item.line_total, JSON.stringify(item.options || {}), item.notes || '', timestamps.utc, timestamps.monterrey
    )));

    // 4) Crear la preferencia con el token OAuth del tenant (nunca uno
    //    global) — esta es la diferencia central frente a un solo negocio.
    const accessToken = await getValidAccessToken(env, tenantId, 'mercado_pago');
    const appUrl = String(env.APP_URL || requestUrl.origin).replace(/\/+$/, '');
    const checkoutOrigin = requestUrl.origin.replace(/\/+$/, '');

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        items: lineItems.map((item) => ({
          id: item.product_id,
          title: item.product_name,
          quantity: item.quantity,
          currency_id: 'MXN',
          unit_price: item.unit_price,
        })),
        external_reference: String(orderId),
        marketplace_fee: 0,
        back_urls: {
          success: `${checkoutOrigin}/?mp_order=${orderId}&mp_status=success`,
          failure: `${checkoutOrigin}/?mp_order=${orderId}&mp_status=failure`,
          pending: `${checkoutOrigin}/?mp_order=${orderId}&mp_status=pending`,
        },
        auto_return: 'approved',
        // order_id propio en el query — así el webhook sabe a que tenant
        // pertenece este pago sin tener que adivinar (ver webhooks/mercadopago.js).
        notification_url: `${appUrl}/api/webhooks/mercadopago?order_id=${orderId}`,
      }),
    });
    const preference = await preferenceResponse.json().catch(() => ({}));

    if (!preferenceResponse.ok || !preference.init_point) {
      await env.DB.prepare(`UPDATE orders SET payment_status = 'error', updated_at_utc = ? WHERE id = ?`).bind(nowIso(), orderId).run();
      return jsonResponse({ ok: false, error: 'No se pudo generar el pago.', detail: preference.message }, 502);
    }

    await env.DB.prepare(`UPDATE orders SET payment_preference_id = ?, updated_at_utc = ? WHERE id = ?`)
      .bind(preference.id, nowIso(), orderId).run();

    return jsonResponse({ ok: true, orderId, orderNumber, initPoint: preference.init_point, total });
  } catch (error) {
    const status = error.status || 500;
    return jsonResponse({ ok: false, error: error.message || 'No se pudo crear el pedido.' }, status);
  }
}
