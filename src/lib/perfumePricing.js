export const DEFAULT_PERFUME_PRICING_RULES = {
  enabled: true,
  rules: [
    { id: '30ml-2x120', variantId: '30ml', minQuantity: 2, maxQuantity: 9, bundleQuantity: 2, bundlePrice: 120, label: '2 por $120' },
    { id: '30ml-10', variantId: '30ml', minQuantity: 10, maxQuantity: 19, unitPrice: 55, label: 'Desde 10 piezas: $55 c/u' },
    { id: '30ml-20', variantId: '30ml', minQuantity: 20, unitPrice: 50, label: 'Desde 20 piezas: $50 c/u' },
    { id: '60ml-10', variantId: '60ml', minQuantity: 10, maxQuantity: 19, unitPrice: 110, label: 'Desde 10 piezas: $110 c/u' },
    { id: '60ml-20', variantId: '60ml', minQuantity: 20, unitPrice: 100, label: 'Desde 20 piezas: $100 c/u' },
  ],
};

export function normalizePerfumePricingRules(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rules = (Array.isArray(source.rules) ? source.rules : DEFAULT_PERFUME_PRICING_RULES.rules)
    .map((rule, index) => ({
      id: String(rule.id || `regla-${index + 1}`), variantId: String(rule.variantId || '').trim(),
      minQuantity: Math.max(1, Math.floor(Number(rule.minQuantity || 1))),
      ...(Number(rule.maxQuantity) > 0 ? { maxQuantity: Math.floor(Number(rule.maxQuantity)) } : {}),
      ...(Number(rule.bundleQuantity) > 0 && Number(rule.bundlePrice) >= 0 ? { bundleQuantity: Math.floor(Number(rule.bundleQuantity)), bundlePrice: Number(rule.bundlePrice) } : {}),
      ...(Number(rule.unitPrice) >= 0 && rule.unitPrice !== '' && rule.unitPrice !== null && rule.unitPrice !== undefined ? { unitPrice: Number(rule.unitPrice) } : {}),
      label: String(rule.label || '').trim(),
    }))
    .filter((rule) => rule.variantId && (rule.unitPrice !== undefined || (rule.bundleQuantity && rule.bundlePrice !== undefined)));
  return { enabled: source.enabled !== false, rules };
}

export function calculatePerfumePricing(items = [], config) {
  const pricing = normalizePerfumePricingRules(config);
  const regularSubtotal = items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Math.max(1, Number(item.quantity || 1)), 0);
  if (!pricing.enabled || !pricing.rules.length) return { subtotal: regularSubtotal, regularSubtotal, discount: 0, appliedRules: [] };
  const groups = new Map();
  for (const item of items) {
    const variantId = String(item.variantId || item.options?.variant || '').trim();
    if (!variantId) continue;
    const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
    const addOnPrice = Math.max(0, Number(item.addOnPrice || 0));
    const baseUnitPrice = Math.max(0, Number(item.basePrice ?? (Number(item.unitPrice || 0) - addOnPrice)));
    const group = groups.get(variantId) || { quantity: 0, regularBase: 0 };
    group.quantity += quantity; group.regularBase += baseUnitPrice * quantity;
    groups.set(variantId, group);
  }
  let subtotal = regularSubtotal; const appliedRules = [];
  for (const [variantId, group] of groups) {
    const candidates = pricing.rules.filter((rule) => rule.variantId === variantId && group.quantity >= rule.minQuantity && (!rule.maxQuantity || group.quantity <= rule.maxQuantity));
    if (!candidates.length) continue;
    const rule = [...candidates].sort((a, b) => b.minQuantity - a.minQuantity)[0];
    let promotedBase = group.regularBase;
    if (rule.unitPrice !== undefined) promotedBase = rule.unitPrice * group.quantity;
    else if (rule.bundleQuantity) {
      const bundles = Math.floor(group.quantity / rule.bundleQuantity);
      const regularUnit = group.quantity ? group.regularBase / group.quantity : 0;
      promotedBase = bundles * rule.bundlePrice + (group.quantity % rule.bundleQuantity) * regularUnit;
    }
    const discount = Math.max(0, group.regularBase - promotedBase);
    if (discount > 0) { subtotal -= discount; appliedRules.push({ ...rule, quantity: group.quantity, discount }); }
  }
  return { subtotal, regularSubtotal, discount: regularSubtotal - subtotal, appliedRules };
}
