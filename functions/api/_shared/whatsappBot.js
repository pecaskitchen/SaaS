import { requireDb } from './http.js';
import {
  sendInteractiveList,
  sendInteractiveButtons,
  sendTextMessage,
  logWhatsappMessage,
} from './whatsapp.js';
import { cartSummaryText, createConversationOrder, loadTenantCatalog } from './conversationalCommerce.js';
import { CONVERSATION_COPY, completedOrderText, nextConversationStep } from './conversationFlow.js';

async function getConversation(env, tenantId, customerPhone) {
  const row = await requireDb(env).prepare(
    `SELECT * FROM whatsapp_conversations WHERE tenant_id = ? AND customer_phone = ?`,
  ).bind(tenantId, customerPhone).first();
  if (row) return { ...row, cart: JSON.parse(row.cart_json || '{}') };
  return { tenant_id: tenantId, customer_phone: customerPhone, state: 'idle', cart: {}, order_id: null };
}

async function saveConversation(env, conversation) {
  await requireDb(env).prepare(`
    INSERT INTO whatsapp_conversations (id, tenant_id, customer_phone, state, cart_json, order_id, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, customer_phone) DO UPDATE SET
      state = excluded.state, cart_json = excluded.cart_json, order_id = excluded.order_id,
      last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  `).bind(
    crypto.randomUUID(), conversation.tenant_id, conversation.customer_phone,
    conversation.state, JSON.stringify(conversation.cart || {}), conversation.order_id || null,
  ).run();
}

function whatsappAdapter(env, { connection, accessToken, to, correlationId }) {
  async function record(result, messageType, content) {
    await logWhatsappMessage(env, {
      tenantId: connection.tenant_id,
      customerPhone: to,
      direction: 'outbound',
      messageType,
      waMessageId: result?.messages?.[0]?.id || null,
      content: { ...content, correlationId },
    });
  }

  const adapter = {
    async text(body) {
      const result = await sendTextMessage(env, { phoneNumberId: connection.phone_number_id, accessToken, to, body });
      await record(result, 'text', { body });
    },
    async categories(categories) {
      const rows = categories.slice(0, 10).map((category) => ({ id: `cat:${category.id}`, title: String(category.label || category.id).slice(0, 24) }));
      if (!rows.length) return adapter.text(CONVERSATION_COPY.noCategories);
      const result = await sendInteractiveList(env, {
        phoneNumberId: connection.phone_number_id, accessToken, to,
        header: 'Catálogo', bodyText: 'Elige una categoría', buttonLabel: 'Ver categorías',
        sections: [{ title: 'Categorías', rows }],
      });
      await record(result, 'interactive:list:categories', { categoryCount: rows.length });
    },
    async products(categoryId, products) {
      const rows = products.filter((product) => product.category === categoryId).slice(0, 10).map((product) => ({
        id: `prod:${product.id}`,
        title: String(product.name).slice(0, 24),
        description: `$${Math.round(Number(product.price) || 0)}`,
      }));
      if (!rows.length) return adapter.text(CONVERSATION_COPY.noProducts);
      const result = await sendInteractiveList(env, {
        phoneNumberId: connection.phone_number_id, accessToken, to,
        header: 'Productos', bodyText: 'Elige un producto', buttonLabel: 'Ver productos',
        sections: [{ title: 'Disponibles', rows }],
      });
      await record(result, 'interactive:list:products', { categoryId, productCount: rows.length });
    },
    async cart(body) {
      await adapter.text(body);
      const result = await sendInteractiveButtons(env, {
        phoneNumberId: connection.phone_number_id, accessToken, to,
        bodyText: '¿Qué quieres hacer?',
        buttons: [
          { id: 'action:more', title: 'Seguir viendo' },
          { id: 'action:checkout', title: 'Finalizar pedido' },
          { id: 'action:clear', title: 'Vaciar carrito' },
        ],
      });
      await record(result, 'interactive:buttons:cart', {});
    },
    async confirm(body) {
      const result = await sendInteractiveButtons(env, {
        phoneNumberId: connection.phone_number_id, accessToken, to, bodyText: body,
        buttons: [{ id: 'action:confirm', title: 'Confirmar pedido' }, { id: 'action:cancel', title: 'Cancelar' }],
      });
      await record(result, 'interactive:buttons:confirm', {});
    },
  };
  return adapter;
}

async function emitResponses(adapter, responses) {
  for (const response of responses) {
    if (response.type === 'text') await adapter.text(response.text);
    if (response.type === 'categories') await adapter.categories(response.categories);
    if (response.type === 'products') await adapter.products(response.categoryId, response.products);
    if (response.type === 'cart') await adapter.cart(cartSummaryText(response.cart, response.products));
    if (response.type === 'confirm') await adapter.confirm(response.text);
  }
}

export async function handleIncomingMessage(env, { connection, accessToken, from, message, correlationId = '' }) {
  const { products, categories } = await loadTenantCatalog(env, connection.tenant_id);
  const conversation = await getConversation(env, connection.tenant_id, from);
  const action = message?.interactive?.list_reply?.id || message?.interactive?.button_reply?.id || '';
  const text = String(message?.text?.body || '').trim();
  const step = nextConversationStep({ conversation, input: { text, action }, products, categories });
  conversation.state = step.state;
  conversation.cart = step.cart;
  await saveConversation(env, conversation);

  const adapter = whatsappAdapter(env, { connection, accessToken, to: from, correlationId });
  if (step.command === 'create_order') {
    const created = await createConversationOrder(env, {
      tenantId: connection.tenant_id, channel: 'whatsapp', customerId: from, conversation, products,
    });
    conversation.order_id = created.orderId;
    conversation.cart = {};
    await saveConversation(env, conversation);
    await adapter.text(completedOrderText(created.orderNumber));
    return created;
  }
  await emitResponses(adapter, step.responses || []);
  return { state: conversation.state };
}
