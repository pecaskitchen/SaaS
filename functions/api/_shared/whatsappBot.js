import { requireDb, nowIso } from './http.js';
import { ensureSchema } from '../orders.js';
import { ensurePaymentTables } from './payments.js';
import { upsertCustomerFromOrder } from './crm.js';
import { loadTenantCatalog, cartTotal, cartSummaryText } from './conversationalCommerce.js';
import {
  sendInteractiveList,
  sendInteractiveButtons,
  sendTextMessage,
} from './whatsapp.js';

const MAX_LIST_ROWS = 10; // límite de WhatsApp para listas interactivas

// -----------------------------------------------------------------------
// Conversación (estado por tenant + teléfono del cliente)
// -----------------------------------------------------------------------
async function getConversation(env, tenantId, customerPhone) {
  const db = requireDb(env);
  const row = await db.prepare(`SELECT * FROM whatsapp_conversations WHERE tenant_id = ? AND customer_phone = ?`).bind(tenantId, customerPhone).first();
  if (row) return { ...row, cart: JSON.parse(row.cart_json || '{}') };
  return { tenant_id: tenantId, customer_phone: customerPhone, state: 'idle', cart: {}, order_id: null };
}

async function saveConversation(env, conversation) {
  const db = requireDb(env);
  await db.prepare(`
    INSERT INTO whatsapp_conversations (id, tenant_id, customer_phone, state, cart_json, order_id, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, customer_phone) DO UPDATE SET
      state = excluded.state, cart_json = excluded.cart_json, order_id = excluded.order_id,
      last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `).bind(crypto.randomUUID(), conversation.tenant_id, conversation.customer_phone, conversation.state, JSON.stringify(conversation.cart || {}), conversation.order_id || null).run();
}

// -----------------------------------------------------------------------
// Envío de las pantallas del flujo
// -----------------------------------------------------------------------
async function sendCategoryList(env, connection, to, categories) {
  const sections = [{
    title: 'Categorías',
    rows: categories.slice(0, MAX_LIST_ROWS).map((cat) => ({ id: `cat:${cat.id}`, title: String(cat.label || cat.id).slice(0, 24) })),
  }];
  await sendInteractiveList(env, {
    phoneNumberId: connection.phone_number_id,
    accessToken: connection._accessToken,
    to,
    bodyText: '¿Qué se te antoja hoy? Elige una categoría 👇',
    buttonLabel: 'Ver categorías',
    sections,
  });
}

async function sendProductList(env, connection, to, categoryId, products) {
  const items = products.filter((p) => p.category === categoryId).slice(0, MAX_LIST_ROWS);
  if (!items.length) {
    await sendTextMessage(env, { phoneNumberId: connection.phone_number_id, accessToken: connection._accessToken, to, body: 'No hay productos disponibles en esa categoría ahorita.' });
    return;
  }
  const sections = [{
    title: 'Productos',
    rows: items.map((p) => ({ id: `prod:${p.id}`, title: String(p.name).slice(0, 24), description: `$${Math.round(p.price)}` })),
  }];
  await sendInteractiveList(env, {
    phoneNumberId: connection.phone_number_id,
    accessToken: connection._accessToken,
    to,
    bodyText: 'Elige un producto para agregarlo a tu pedido:',
    buttonLabel: 'Ver productos',
    sections,
  });
}

async function sendCartButtons(env, connection, to, cart, products) {
  await sendTextMessage(env, { phoneNumberId: connection.phone_number_id, accessToken: connection._accessToken, to, body: cartSummaryText(cart, products) });
  await sendInteractiveButtons(env, {
    phoneNumberId: connection.phone_number_id,
    accessToken: connection._accessToken,
    to,
    bodyText: '¿Qué quieres hacer?',
    buttons: [
      { id: 'action:more', title: 'Seguir viendo menú' },
      { id: 'action:checkout', title: 'Finalizar pedido' },
      { id: 'action:clear', title: 'Vaciar carrito' },
    ],
  });
}

// -----------------------------------------------------------------------
// Punto de entrada — se llama desde el webhook por cada mensaje entrante
// -----------------------------------------------------------------------
export async function handleIncomingMessage(env, { connection, accessToken, from, message }) {
  const conn = { ...connection, _accessToken: accessToken };
  const { products, categories } = await loadTenantCatalog(env, connection.tenant_id);
  const conversation = await getConversation(env, connection.tenant_id, from);

  const interactiveId = message?.interactive?.list_reply?.id || message?.interactive?.button_reply?.id || '';
  const text = String(message?.text?.body || '').trim();

  // Saludo / reinicio explícito, o primer contacto.
  if (/^(hola|menu|menú|hi|hello|inicio|empezar)$/i.test(text) || (conversation.state === 'idle' && !interactiveId)) {
    conversation.state = 'browsing_category';
    conversation.cart = conversation.cart || {};
    await saveConversation(env, conversation);
    await sendCategoryList(env, conn, from, categories);
    return;
  }

  if (interactiveId.startsWith('cat:')) {
    const categoryId = interactiveId.slice('cat:'.length);
    conversation.state = 'browsing_category';
    await saveConversation(env, conversation);
    await sendProductList(env, conn, from, categoryId, products);
    return;
  }

  if (interactiveId.startsWith('prod:')) {
    const productId = interactiveId.slice('prod:'.length);
    const product = products.find((p) => p.id === productId);
    if (product) {
      conversation.cart = { ...conversation.cart, [productId]: (conversation.cart[productId] || 0) + 1 };
    }
    conversation.state = 'reviewing_cart';
    await saveConversation(env, conversation);
    await sendCartButtons(env, conn, from, conversation.cart, products);
    return;
  }

  if (interactiveId === 'action:more') {
    await sendCategoryList(env, conn, from, categories);
    return;
  }

  if (interactiveId === 'action:clear') {
    conversation.cart = {};
    conversation.state = 'browsing_category';
    await saveConversation(env, conversation);
    await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: 'Carrito vacío. Escribe "menu" para empezar de nuevo.' });
    return;
  }

  if (interactiveId === 'action:checkout') {
    if (!Object.keys(conversation.cart || {}).length) {
      await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: 'Tu carrito está vacío — escribe "menu" para ver los productos.' });
      return;
    }
    conversation.state = 'awaiting_name';
    await saveConversation(env, conversation);
    await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: '¿A nombre de quién es el pedido?' });
    return;
  }

  if (conversation.state === 'awaiting_name' && text) {
    conversation.cart = { ...conversation.cart, __customerName: text };
    conversation.state = 'awaiting_address';
    await saveConversation(env, conversation);
    await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: '¿Cuál es la dirección de entrega? (o escribe "recojo" si pasas por él)' });
    return;
  }

  if (conversation.state === 'awaiting_address' && text) {
    conversation.cart = { ...conversation.cart, __customerAddress: text };
    conversation.state = 'awaiting_confirmation';
    await saveConversation(env, conversation);
    const { __customerName, __customerAddress, ...items } = conversation.cart;
    await sendTextMessage(env, {
      phoneNumberId: conn.phone_number_id, accessToken, to: from,
      body: `Resumen de tu pedido:\n\n${cartSummaryText(items, products)}\n\nA nombre de: ${__customerName}\nEntrega: ${__customerAddress}`,
    });
    await sendInteractiveButtons(env, {
      phoneNumberId: conn.phone_number_id, accessToken, to: from,
      bodyText: '¿Confirmamos el pedido?',
      buttons: [{ id: 'action:confirm', title: 'Confirmar pedido' }, { id: 'action:cancel', title: 'Cancelar' }],
    });
    return;
  }

  if (interactiveId === 'action:cancel') {
    conversation.state = 'idle';
    conversation.cart = {};
    await saveConversation(env, conversation);
    await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: 'Pedido cancelado. Escribe "menu" cuando quieras empezar de nuevo.' });
    return;
  }

  if (interactiveId === 'action:confirm' && conversation.state === 'awaiting_confirmation') {
    const orderId = await createOrderFromConversation(env, connection.tenant_id, from, conversation, products);
    conversation.state = 'completed';
    conversation.order_id = orderId;
    conversation.cart = {};
    await saveConversation(env, conversation);
    await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: `¡Listo! Tu pedido #${orderId} quedó registrado. Te avisamos cuando esté confirmado.` });
    return;
  }

  // Cualquier otro mensaje fuera de flujo reconocido.
  await sendTextMessage(env, { phoneNumberId: conn.phone_number_id, accessToken, to: from, body: 'Escribe "menu" para ver el catálogo y hacer tu pedido.' });
}

// -----------------------------------------------------------------------
// Crear el pedido — recalcula precios contra el catálogo (nunca confía en
// nada que el cliente haya "visto" en la conversación), mismo patrón que
// checkout/create.js.
// -----------------------------------------------------------------------
async function createOrderFromConversation(env, tenantId, customerPhone, conversation, products) {
  await ensureSchema(env);
  await ensurePaymentTables(env);
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
  const orderNumber = `WA-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

  const inserted = await env.DB.prepare(`
    INSERT INTO orders (
      tenant_id, order_number, status, branch_id, branch_name, order_source,
      customer_name, customer_phone, customer_address, customer_notes,
      payment_provider, payment_status, subtotal, delivery_fee, total, payment_amount,
      created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey
    ) VALUES (?, ?, 'pending', 'dominio', 'Dominio', 'whatsapp', ?, ?, ?, '', NULL, 'unpaid', ?, 0, ?, ?, ?, ?, 'America/Monterrey', ?, ?)
  `).bind(
    tenantId, orderNumber, __customerName || 'Cliente WhatsApp', customerPhone, __customerAddress || 'Recoge en tienda',
    subtotal, subtotal, subtotal, timestamps.utc, timestamps.monterrey, timestamps.utc, timestamps.monterrey,
  ).run();

  const orderId = inserted.meta.last_row_id;
  const orderItemsStmt = env.DB.prepare(`
    INSERT INTO order_items (tenant_id, order_id, product_id, product_name, category, quantity, unit_price, line_total, created_at_utc, created_at_monterrey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await env.DB.batch(lineItems.map((item) => orderItemsStmt.bind(
    tenantId, orderId, item.product_id, item.product_name, item.category, item.quantity, item.unit_price, item.line_total, timestamps.utc, timestamps.monterrey
  )));

  await upsertCustomerFromOrder(env, tenantId, {
    customer: { name: __customerName || 'Cliente WhatsApp', phone: customerPhone, address: __customerAddress || '' },
    order: { id: orderId, orderNumber, total: subtotal, createdAtUtc: timestamps.utc },
  });

  return orderId;
}
