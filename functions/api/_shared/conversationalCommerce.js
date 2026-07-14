// Helpers de catálogo/carrito compartidos entre los bots de pedidos por
// chat (whatsappBot.js, metaMessagingBot.js) -- antes duplicados byte a
// byte en ambos archivos.

import { tenantSettingKey, ensureTenantColumns } from './tenant.js';
import { normalizeSavedMenu, readEffectiveCatalog, cleanPublicOverrides } from './menuCatalog.js';

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
