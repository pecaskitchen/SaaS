import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextConversationStep } from '../functions/api/_shared/conversationFlow.js';

const products = [{ id: 'cafe', name: 'Café', category: 'bebidas', price: 40 }];
const categories = [{ id: 'bebidas', label: 'Bebidas' }];

test('el motor agrega una vez y avanza a carrito', () => {
  const result = nextConversationStep({
    conversation: { state: 'browsing_category', cart: {} },
    input: { action: 'prod:cafe' },
    products,
    categories,
  });
  assert.equal(result.cart.cafe, 1);
  assert.equal(result.responses.length, 1);
  assert.equal(result.responses[0].type, 'cart');
});

test('confirmar solo crea pedido desde awaiting_confirmation', () => {
  const invalid = nextConversationStep({
    conversation: { state: 'idle', cart: { cafe: 1 } },
    input: { action: 'action:confirm' },
    products,
    categories,
  });
  assert.equal(invalid.command, undefined);
  const valid = nextConversationStep({
    conversation: { state: 'awaiting_confirmation', cart: { cafe: 1, __customerName: 'Ana', __customerAddress: 'Recojo' } },
    input: { action: 'action:confirm' },
    products,
    categories,
  });
  assert.equal(valid.command, 'create_order');
});

test('checkout no acepta un carrito sin productos reales', () => {
  const result = nextConversationStep({
    conversation: { state: 'reviewing_cart', cart: { __customerName: 'Ana' } },
    input: { action: 'action:checkout' },
    products,
    categories,
  });
  assert.equal(result.state, 'reviewing_cart');
  assert.equal(result.responses[0].type, 'text');
});
