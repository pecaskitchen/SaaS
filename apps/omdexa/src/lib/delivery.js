export const PECAS_FREE_DELIVERY_MINIMUM = 250;
export const PECAS_STANDARD_DELIVERY_FEE = 15;

export function normalizeDeliveryArea(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function pecasDeliveryFee({ fulfillmentType, neighborhood, subtotal }) {
  if (fulfillmentType !== 'Entrega a domicilio') return 0;
  if (normalizeDeliveryArea(neighborhood) === 'adara') return 0;
  if (Number(subtotal || 0) >= PECAS_FREE_DELIVERY_MINIMUM) return 0;
  return PECAS_STANDARD_DELIVERY_FEE;
}
