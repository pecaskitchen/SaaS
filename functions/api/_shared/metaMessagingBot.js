import { requireDb, nowIso } from './http.js';
import { tenantSettingKey, ensureTenantColumns } from './tenant.js';
import { normalizeSavedMenu, readEffectiveCatalog, cleanPublicOverrides } from './menuCatalog.js';
import { ensureSchema } from '../orders.js';
import {
  sendText,
  sendQuickReplies,
  sendGenericTemplate,
} from './metaMessaging.js';

const MAX_CAROUSEL_ELEMENTS = 10; // límite del generic template de Meta

// -----------------------------------------------------------------------
// Catálogo -- MISMA fuente que checkout/create.js y whatsappBot.js
// (readEffectiveCatalog), para que el precio que ve el cliente por
// Messenger/Instagram sea siempre el mismo que se cobra al confirmar.
// Duplicado a propósito en vez de importar de whatsappBot.js -- ver
// justificación en el plan (no tocar nada del canal de WhatsApp ya en
// producción).
// -----------------------------------------------------------------------
async function loadTenantCatalog(env, tenantId) {
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

// -----------------------------------------------------------------------
// Conversación (estado por tenant + canal + customer_id)
// -----------------------------------------------------------------------
async function getConversation(env, tenantId, channel, customerId) {
  const db = requireDb(env);
  const row = await db.prepare(`SELECT * FROM meta_channel_conversations WHERE tenant_id = ? AND channel = ? AND customer_id = ?`).bind(tenantId, channel, customerId).first();
  if (row) return { ...row, cart: JSON.parse(row.cart_json || '{}') };
  return { tenant_id: tenantId, channel, customer_id: customerId, state: 'idle', cart: {}, order_id: null };
}

async function saveConversation(env, conversation) {
  const db = requireDb(env);
  await db.prepare(`
    INSERT INTO meta_channel_conversations (id, tenant_id, channel, customer_id, state, cart_json, order_id, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, channel, customer_id) DO UPDATE SET
      state = excluded.state, cart_json = excluded.cart_json, order_id = excluded.order_id,
      last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `).bind(crypto.randomUUID(), conversation.tenant_id, conversation.channel, conversation.customer_id, conversation.state, JSON.stringify(conversation.cart || {}), conversation.order_id || null).run();
}

function cartTotal(cart, products) {
  let total = 0;
  for (const [productId, qty] of Object.entries(cart)) {
    const product = products.find((p) => p.id === productId);
    if (product) total += Math.round(product.price) * qty;
  }
  return total;
}

function cartSummaryText(cart, products) {
  const lines = Object.entries(cart).map(([productId, qty]) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    return `${qty}x ${product.name} — $${Math.round(product.price) * qty}`;
  }).filter(Boolean);
  return lines.length ? `${lines.join('\n')}\n\nTotal: $${cartTotal(cart, products)}` : 'Tu carrito está vacío.';
}

// -----------------------------------------------------------------------
// Envío de las pantallas del flujo -- generic template (carrusel) en vez
// de las listas interactivas de WhatsApp, quick replies en vez de botones.
// -----------------------------------------------------------------------
async function sendCategoryCarousel(env, conn, to, categories) {
  const elements = categories.slice(0, MAX_CAROUSEL_ELEMENTS).map((cat) => ({
    title: String(cat.label || cat.id).slice(0, 80),
    buttons: [{ type: 'postback', title: 'Ver productos', payload: `cat:${cat.id}` }],
  }));
  if (!elements.length) {
    await sendText(env, { endpointId: conn.endpointId, accessToken: conn.accessToken, to, text: 'No hay categorías disponibles ahorita.' });
    return;
  }
  await sendGenericTemplate(env, { endpointId: conn.endpointId, accessToken: conn.accessToken, to, elements });
}

async function sendProductCarousel(env, conn, to, categoryId, products) {
  const items = products.filter((p) => p.category === categoryId).slice(0, MAX_CAROUSEL_ELEMENTS);
  if (!items.length) {
    await sendText(env, { endpointId: conn.endpointId, accessToken: conn.accessToken, to, text: 'No hay productos disponibles en esa categoría ahorita.' });
    return;
  }
  const elements = items.map((p) => ({
    title: String(p.name).slice(0, 80),
    subtitle: `$${Math.round(p.price)}`,
    buttons: [{ type: 'postback', title: 'Agregar', payload: `prod:${p.id}` }],
  }));
  await sendGenericTemplate(env, { endpointId: conn.endpointId, accessToken: conn.accessToken, to, elements });
}

async function sendCartQuickReplies(env, conn, to, cart, products) {
  await sendText(env, { endpointId: conn.endpointId, accessToken: conn.accessToken, to, text: cartSummaryText(cart, products) });
  await sendQuickReplies(env, {
    endpointId: conn.endpointId,
    accessToken: conn.accessToken,
    to,
    text: '¿Qué quieres hacer?',
    quickReplies: [
      { title: 'Seguir viendo menú', payload: 'action:more' },
      { title: 'Finalizar pedido', payload: 'action:checkout' },
      { title: 'Vaciar carrito', payload: 'action:clear' },
    ],
  });
}

// -----------------------------------------------------------------------
// Punto de entrada -- se llama desde el webhook por cada evento de mensaje
// entrante de Messenger o Instagram. `event` es el objeto crudo tal como
// llega en `entry[].messaging[]` (mismo shape para ambos canales).
// -----------------------------------------------------------------------
export async function handleIncomingEvent(env, { channel, endpointId, accessToken, tenantId, from, event }) {
  const conn = { endpointId, accessToken };
  const { products, categories } = await loadTenantCatalog(env, tenantId);
  const conversation = await getConversation(env, tenantId, channel, from);

  const payload = event?.postback?.payload || event?.message?.quick_reply?.payload || '';
  const text = String(event?.message?.text || '').trim();

  // Saludo / reinicio explícito, o primer contacto.
  if (/^(hola|menu|menú|hi|hello|inicio|empezar)$/i.test(text) || (conversation.state === 'idle' && !payload)) {
    conversation.state = 'browsing_category';
    conversation.cart = conversation.cart || {};
    await saveConversation(env, conversation);
    await sendCategoryCarousel(env, conn, from, categories);
    return;
  }

  if (payload.startsWith('cat:')) {
    const categoryId = payload.slice('cat:'.length);
    conversation.state = 'browsing_category';
    await saveConversation(env, conversation);
    await sendProductCarousel(env, conn, from, categoryId, products);
    return;
  }

  if (payload.startsWith('prod:')) {
    const productId = payload.slice('prod:'.length);
    const product = products.find((p) => p.id === productId);
    if (product) {
      conversation.cart = { ...conversation.cart, [productId]: (conversation.cart[productId] || 0) + 1 };
    }
    conversation.state = 'reviewing_cart';
    await saveConversation(env, conversation);
    await sendCartQuickReplies(env, conn, from, conversation.cart, products);
    return;
  }

  if (payload === 'action:more') {
    await sendCategoryCarousel(env, conn, from, categories);
    return;
  }

  if (payload === 'action:clear') {
    conversation.cart = {};
    conversation.state = 'browsing_category';
    await saveConversation(env, conversation);
    await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: 'Carrito vacío. Escribe "menu" para empezar de nuevo.' });
    return;
  }

  if (payload === 'action:checkout') {
    if (!Object.keys(conversation.cart || {}).length) {
      await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: 'Tu carrito está vacío — escribe "menu" para ver los productos.' });
      return;
    }
    conversation.state = 'awaiting_name';
    await saveConversation(env, conversation);
    await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: '¿A nombre de quién es el pedido?' });
    return;
  }

  if (conversation.state === 'awaiting_name' && text) {
    conversation.cart = { ...conversation.cart, __customerName: text };
    conversation.state = 'awaiting_address';
    await saveConversation(env, conversation);
    await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: '¿Cuál es la dirección de entrega? (o escribe "recojo" si pasas por él)' });
    return;
  }

  if (conversation.state === 'awaiting_address' && text) {
    conversation.cart = { ...conversation.cart, __customerAddress: text };
    conversation.state = 'awaiting_confirmation';
    await saveConversation(env, conversation);
    const { __customerName, __customerAddress, ...items } = conversation.cart;
    await sendText(env, {
      endpointId: conn.endpointId, accessToken, to: from,
      text: `Resumen de tu pedido:\n\n${cartSummaryText(items, products)}\n\nA nombre de: ${__customerName}\nEntrega: ${__customerAddress}`,
    });
    await sendQuickReplies(env, {
      endpointId: conn.endpointId, accessToken, to: from,
      text: '¿Confirmamos el pedido?',
      quickReplies: [{ title: 'Confirmar pedido', payload: 'action:confirm' }, { title: 'Cancelar', payload: 'action:cancel' }],
    });
    return;
  }

  if (payload === 'action:cancel') {
    conversation.state = 'idle';
    conversation.cart = {};
    await saveConversation(env, conversation);
    await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: 'Pedido cancelado. Escribe "menu" cuando quieras empezar de nuevo.' });
    return;
  }

  if (payload === 'action:confirm' && conversation.state === 'awaiting_confirmation') {
    const orderId = await createOrderFromConversation(env, tenantId, channel, from, conversation, products);
    conversation.state = 'completed';
    conversation.order_id = orderId;
    conversation.cart = {};
    await saveConversation(env, conversation);
    await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: `¡Listo! Tu pedido #${orderId} quedó registrado. Te avisamos cuando esté confirmado.` });
    return;
  }

  // Cualquier otro mensaje fuera de flujo reconocido.
  await sendText(env, { endpointId: conn.endpointId, accessToken, to: from, text: 'Escribe "menu" para ver el catálogo y hacer tu pedido.' });
}

// -----------------------------------------------------------------------
// Crear el pedido -- recalcula precios contra el catálogo (nunca confía en
// nada que el cliente haya "visto" en la conversación), mismo patrón que
// checkout/create.js y whatsappBot.js.
// -----------------------------------------------------------------------
async function createOrderFromConversation(env, tenantId, channel, customerId, conversation, products) {
  await ensureSchema(env);
  const { __customerName, __customerAddress, ...items } = conversation.cart;

  let subtotal = 0;
  const lineItems = [];
  for (const [productId, quantity] of Object.entries(items)) {
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    const unitPrice = Math.max(0, Math.round(product.price));
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    lineItems.push({ product_id: productId, product_name: product.name, category: product.category || 'general', quantity, unit_price: unitPrice, line_total: lineTotal });
  }

  const timestamps = { utc: nowIso(), monterrey: new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' }).replace(' ', 'T') };
  const prefix = channel === 'instagram' ? 'IG' : 'MSG';
  const orderNumber = `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

  const inserted = await env.DB.prepare(`
    INSERT INTO orders (
      tenant_id, order_number, status, branch_id, branch_name, order_source,
      customer_name, customer_phone, customer_address, customer_notes,
      payment_provider, payment_status, subtotal, delivery_fee, total, payment_amount,
      created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
    ) VALUES (?, ?, 'pending', 'dominio', 'Dominio', ?, ?, ?, ?, '', NULL, 'unpaid', ?, 0, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
  `).bind(
    tenantId, orderNumber, channel, __customerName || 'Cliente', customerId, __customerAddress || 'Recoge en tienda',
    subtotal, subtotal, subtotal, timestamps.utc, timestamps.monterrey, timestamps.utc, timestamps.monterrey,
  ).run();

  const orderId = inserted.meta.last_row_id;
  for (const item of lineItems) {
    await env.DB.prepare(`
      INSERT INTO order_items (tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, created_at_utc, created_at_monterrey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, orderId, item.product_id, item.product_name, item.category, item.quantity, item.unit_price, item.line_total, timestamps.utc, timestamps.monterrey).run();
  }

  return orderId;
}
