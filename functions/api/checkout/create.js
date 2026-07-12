import { jsonResponse, readJson, requireDb, nowIso } from '../_shared/http.js';
import { resolveTenantId, tenantSettingKey, ensureTenantColumns } from '../_shared/tenant.js';
import { normalizeSavedMenu, readEffectiveCatalog } from '../_shared/menuCatalog.js';
import { ensurePaymentTables, getValidAccessToken } from '../_shared/payments.js';
import { ensureSchema } from '../orders.js';

// -----------------------------------------------------------------------
// LIMITACIÓN CONOCIDA (léela antes de usar esto en productos con
// modificadores): este endpoint recalcula el precio de cada línea contra
// el precio BASE del producto (catálogo + overrides + extraProducts del
// tenant). NO valida el costo extra de modificadores/opciones (aderezos,
// tamaños, extras facturables de stock_product_option_groups) — esos se
// aceptan tal cual los mande el cliente. Para productos simples (sin
// opciones) esto ya cierra el hueco de "cambiar el total en el navegador".
// Para productos CON opciones con costo extra, falta un siguiente paso
// que traiga también stock_product_option_groups/stock_option_family_items
// y sume su extra_price real. Ver auditoria-saas-multitenant.md.
//
// Tampoco valida delivery_fee contra una tarifa de sucursal — se acepta
// como venga (mismo comportamiento que ya tenía /api/orders hoy).
// -----------------------------------------------------------------------

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
    priceById.set(product.id, { price, unavailable, name: override?.name || product.name, category: product.category || 'general' });
  }
  return priceById;
}

function getTimestamps() {
  const utc = nowIso();
  const monterrey = new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' }).replace(' ', 'T');
  return { utc, monterrey };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    await ensureSchema(env);
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

    // 2) Recalcular precios contra el catalogo real del tenant — nunca
    //    confiar en unit_price/total que mande el navegador.
    const priceList = await loadTenantPriceList(env, tenantId);
    const lineItems = [];
    let subtotal = 0;
    for (const requested of requestedItems) {
      const productId = String(requested.product_id || requested.id || '').trim();
      const quantity = Math.max(1, Math.floor(Number(requested.quantity || 1)));
      const catalogEntry = priceList.get(productId);
      if (!catalogEntry) return jsonResponse({ ok: false, error: `Producto no encontrado: ${productId}` }, 400);
      if (catalogEntry.unavailable) return jsonResponse({ ok: false, error: `${catalogEntry.name} no esta disponible.` }, 409);

      const unitPrice = Math.max(0, Math.round(catalogEntry.price));
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      lineItems.push({
        product_id: productId,
        product_name: catalogEntry.name,
        category: catalogEntry.category,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const deliveryFee = Math.max(0, Math.round(Number(body.deliveryFee || 0)));
    const total = subtotal + deliveryFee;
    if (total <= 0) return jsonResponse({ ok: false, error: 'El total del pedido debe ser mayor a cero.' }, 400);

    // 3) Crear el pedido con status "pending" / payment_status "unpaid" —
    //    se marca "paid" solo cuando el webhook confirma el pago real.
    const timestamps = getTimestamps();
    const orderNumber = `MP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

    const inserted = await env.DB.prepare(`
      INSERT INTO orders (
        tenant_id, order_number, status, branch_id, branch_name, order_source,
        customer_name, customer_phone, customer_address, customer_notes,
        payment_provider, payment_status,
        subtotal, delivery_fee, total, payment_amount,
        created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
      ) VALUES (?, ?, 'pending', ?, ?, 'online', ?, ?, ?, ?, 'mercado_pago', 'unpaid', ?, ?, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
    `).bind(
      tenantId,
      orderNumber,
      String(body.branchId || 'dominio'),
      String(body.branchName || 'Dominio'),
      String(customer.name).trim(),
      String(customer.phone || '').trim(),
      String(customer.address || (fulfillmentType === 'Recoger' ? 'Recoger' : '')).trim(),
      String(customer.notes || body.customerNotes || '').trim(),
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

    for (const item of lineItems) {
      await env.DB.prepare(`
        INSERT INTO order_items (tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, created_at_utc, created_at_monterrey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(tenantId, orderId, item.product_id, item.product_name, item.category, item.quantity, item.unit_price, item.line_total, timestamps.utc, timestamps.monterrey).run();
    }

    // 4) Crear la preferencia con el token OAuth del tenant (nunca uno
    //    global) — esta es la diferencia central frente a un solo negocio.
    const accessToken = await getValidAccessToken(env, tenantId, 'mercado_pago');
    const appUrl = String(env.APP_URL || '').replace(/\/+$/, '');

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
          success: `${appUrl}/?mp_order=${orderId}&mp_status=success`,
          failure: `${appUrl}/?mp_order=${orderId}&mp_status=failure`,
          pending: `${appUrl}/?mp_order=${orderId}&mp_status=pending`,
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
