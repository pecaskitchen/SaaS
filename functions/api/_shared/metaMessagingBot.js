import { requireDb } from './http.js';
import { loadTenantCatalog, createConversationOrder, cartSummaryText } from './conversationalCommerce.js';
import { CONVERSATION_COPY, completedOrderText, nextConversationStep } from './conversationFlow.js';
import {
  sendText,
  sendQuickReplies,
  sendGenericTemplate,
} from './metaMessaging.js';

const MAX_CAROUSEL_ELEMENTS = 10; // límite del generic template de Meta

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
  const action = event?.postback?.payload || event?.message?.quick_reply?.payload || '';
  const text = String(event?.message?.text || '').trim();
  const step = nextConversationStep({ conversation, input: { text, action }, products, categories });
  conversation.state = step.state;
  conversation.cart = step.cart;
  await saveConversation(env, conversation);

  if (step.command === 'create_order') {
    const created = await createConversationOrder(env, { tenantId, channel, customerId: from, conversation, products });
    conversation.order_id = created.orderId;
    conversation.cart = {};
    await saveConversation(env, conversation);
    await sendText(env, { endpointId, accessToken, to: from, text: completedOrderText(created.orderNumber) });
    return created;
  }

  for (const response of step.responses || []) {
    if (response.type === 'text') await sendText(env, { endpointId, accessToken, to: from, text: response.text });
    if (response.type === 'categories') await sendCategoryCarousel(env, conn, from, response.categories);
    if (response.type === 'products') await sendProductCarousel(env, conn, from, response.categoryId, response.products);
    if (response.type === 'cart') await sendCartQuickReplies(env, conn, from, response.cart, response.products);
    if (response.type === 'confirm') {
      await sendQuickReplies(env, { endpointId, accessToken, to: from, text: response.text || CONVERSATION_COPY.confirm, quickReplies: [{ title: 'Confirmar pedido', payload: 'action:confirm' }, { title: 'Cancelar', payload: 'action:cancel' }] });
    }
  }
  return { state: conversation.state };
}
