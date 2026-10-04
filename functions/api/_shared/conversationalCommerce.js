// Helpers de catálogo/carrito compartidos entre los bots de pedidos por
// chat (whatsappBot.js, metaMessagingBot.js) -- antes duplicados byte a
// byte en ambos archivos.

import { tenantSettingKey, ensureTenantColumns } from './tenant.js';
import { normalizeSavedMenu, readEffectiveCatalog, cleanPublicOverrides } from './menuCatalog.js';
import { requireDb, nowIso } from './http.js';
import { ensureSchema } from '../orders.js';
import { ensurePaymentTables } from './payments.js';
import { upsertCustomerFromOrder } from './crm.js';

// -----------------------------------------------------------------------
// Catálogo — MISMA fuente que checkout/create.js (readEffectiveCatalog),
// para que el precio que ve el cliente en el chat sea siempre el mismo
// que se cobra al confirmar. No dupliques esta lógica en otro lado.
// -----------------------------------------------------------------------
export async function loadTenantCatalog(env, tenantId) {
  await ensureTenantColumns(env, ['app_settings']);
  const settingKey = tenantSettingKey('menu_overrides', tenantId, env);
  const row = await env.DB.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(settingKey).first();
  const saved = normalizeSavedMenu(row?.value_json || '');
  const cleanedOverrides = cleanPublicOverrides(saved.overrides || {});
  const effective = await readEffectiveCatalog(env, tenantId, { ...saved, overrides: cleanedOverrides }, { overrides: cleanedOverrides });

  const products = (effective.extraProducts || []).filter((p) => !p.unavailable);
  const categories = effective.extraCategories || [];
  const categoryHidden = effective.categoryHidden || {};
  const visibleCategories = categories.filter((c) => !categoryHidden[c.id] && products.some((p) => p.category === c.id));

  return { products, categories: visibleCategories };
}

export function cartTotal(cart, products) {
  let total = 0;
  for (const [productId, qty] of Object.entries(cart)) {
    const product = products.find((p) => p.id === productId);
    if (product) total += Math.round(product.price) * qty;
  }
  return total;
}

export function cartSummaryText(cart, products) {
  const lines = Object.entries(cart).map(([productId, qty]) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    return `${qty}x ${product.name} — $${Math.round(product.price) * qty}`;
  }).filter(Boolean);
  return lines.length ? `${lines.join('\n')}\n\nTotal: $${cartTotal(cart, products)}` : 'Tu carrito está vacío.';
}

export async function createConversationOrder(env, { tenantId, channel, customerId, conversation, products }) {
  await ensureSchema(env);
  await ensurePaymentTables(env);
  const { __customerName, __customerAddress, ...items } = conversation.cart || {};
  let subtotal = 0;
  const lineItems = [];
  for (const [productId, rawQuantity] of Object.entries(items)) {
    const product = products.find((row) => row.id === productId);
    if (!product) continue;
    const quantity = Math.max(1, Math.round(Number(rawQuantity) || 1));
    const unitPrice = Math.max(0, Math.round(Number(product.price) || 0));
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    lineItems.push({ product_id: productId, product_name: product.name, category: product.category || 'general', quantity, unit_price: unitPrice, line_total: lineTotal });
  }
  if (!lineItems.length) throw new Error('El carrito ya no contiene productos disponibles.');

  const timestamp = nowIso();
  const localTimestamp = new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' }).replace(' ', 'T');
  const prefix = channel === 'whatsapp' ? 'WA' : channel === 'instagram' ? 'IG' : 'MSG';
  const orderNumber = `${prefix}-${timestamp.replace(/\D/g, '').slice(-12)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const source = channel === 'whatsapp' ? 'whatsapp' : channel;
  const inserted = await requireDb(env).prepare(`
    INSERT INTO orders (
      tenant_id, order_number, status, branch_id, branch_name, order_source,
      customer_name, customer_phone, customer_address, customer_notes,
      payment_provider, payment_status, subtotal, delivery_fee, total, payment_amount,
      created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
    ) VALUES (?, ?, 'pending', 'dominio', 'Dominio', ?, ?, ?, ?, '', NULL, 'unpaid', ?, 0, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
  `).bind(
    tenantId, orderNumber, source, __customerName || 'Cliente', customerId,
    __customerAddress || 'Recoge en tienda', subtotal, subtotal, subtotal,
    timestamp, localTimestamp, timestamp, localTimestamp,
  ).run();

  const orderId = inserted.meta.last_row_id;
  const itemStatement = requireDb(env).prepare(`
    INSERT INTO order_items (tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, created_at_utc, created_at_monterrey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await requireDb(env).batch(lineItems.map((item) => itemStatement.bind(
    tenantId, orderId, item.product_id, item.product_name, item.category,
    item.quantity, item.unit_price, item.line_total, timestamp, localTimestamp,
  )));
  await upsertCustomerFromOrder(env, tenantId, {
    customer: { name: __customerName || 'Cliente', phone: customerId, address: __customerAddress || '' },
    order: { id: orderId, orderNumber, total: subtotal, createdAtUtc: timestamp },
  });
  return { orderId, orderNumber };
}
