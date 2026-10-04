import { cartSummaryText } from './conversationalCommerce.js';

export const CONVERSATION_COPY = Object.freeze({
  noCategories: 'No hay categorías disponibles por ahora.',
  noProducts: 'No hay productos disponibles en esa categoría por ahora.',
  cartEmpty: 'Tu carrito está vacío. Escribe "menu" para ver los productos.',
  cartCleared: 'Carrito vacío. Escribe "menu" para empezar de nuevo.',
  askName: '¿A nombre de quién es el pedido?',
  askAddress: '¿Cuál es la dirección de entrega? También puedes escribir "recojo".',
  confirm: '¿Confirmamos el pedido?',
  cancelled: 'Pedido cancelado. Escribe "menu" cuando quieras empezar de nuevo.',
  fallback: 'Escribe "menu" para ver el catálogo y hacer tu pedido.',
});

function clean(value) {
  return String(value || '').trim();
}

export function normalizeConversationInput({ text = '', action = '' } = {}) {
  return { text: clean(text), action: clean(action) };
}

export function nextConversationStep({ conversation, input, products = [], categories = [] }) {
  const state = conversation?.state || 'idle';
  const cart = { ...(conversation?.cart || {}) };
  const { text, action } = normalizeConversationInput(input);
  const isGreeting = /^(hola|menu|menú|hi|hello|inicio|empezar)$/i.test(text);

  if (isGreeting || (state === 'idle' && !action)) {
    return { state: 'browsing_category', cart, responses: [{ type: 'categories', categories }] };
  }

  if (action.startsWith('cat:')) {
    return { state: 'browsing_category', cart, responses: [{ type: 'products', categoryId: action.slice(4), products }] };
  }

  if (action.startsWith('prod:')) {
    const productId = action.slice(5);
    if (products.some((product) => product.id === productId)) cart[productId] = (cart[productId] || 0) + 1;
    return { state: 'reviewing_cart', cart, responses: [{ type: 'cart', cart, products }] };
  }

  if (action === 'action:more') {
    return { state, cart, responses: [{ type: 'categories', categories }] };
  }

  if (action === 'action:clear') {
    return { state: 'browsing_category', cart: {}, responses: [{ type: 'text', text: CONVERSATION_COPY.cartCleared }] };
  }

  if (action === 'action:checkout') {
    if (!Object.keys(cart).some((key) => !key.startsWith('__'))) {
      return { state, cart, responses: [{ type: 'text', text: CONVERSATION_COPY.cartEmpty }] };
    }
    return { state: 'awaiting_name', cart, responses: [{ type: 'text', text: CONVERSATION_COPY.askName }] };
  }

  if (state === 'awaiting_name' && text) {
    cart.__customerName = text;
    return { state: 'awaiting_address', cart, responses: [{ type: 'text', text: CONVERSATION_COPY.askAddress }] };
  }

  if (state === 'awaiting_address' && text) {
    cart.__customerAddress = text;
    const { __customerName, __customerAddress, ...items } = cart;
    return {
      state: 'awaiting_confirmation',
      cart,
      responses: [
        { type: 'text', text: `Resumen de tu pedido:\n\n${cartSummaryText(items, products)}\n\nA nombre de: ${__customerName}\nEntrega: ${__customerAddress}` },
        { type: 'confirm', text: CONVERSATION_COPY.confirm },
      ],
    };
  }

  if (action === 'action:cancel') {
    return { state: 'idle', cart: {}, responses: [{ type: 'text', text: CONVERSATION_COPY.cancelled }] };
  }

  if (action === 'action:confirm' && state === 'awaiting_confirmation') {
    return { state: 'completed', cart, command: 'create_order', responses: [] };
  }

  return { state, cart, responses: [{ type: 'text', text: CONVERSATION_COPY.fallback }] };
}

export function completedOrderText(orderId) {
  return `¡Listo! Tu pedido #${orderId} quedó registrado. Te avisamos cuando esté confirmado.`;
}
