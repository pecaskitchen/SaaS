export const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

export const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

export function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

export function normalizeBranchId(value, fallback = 'dominio') {
  return String(value || fallback).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

// Campos configurables del formulario de pedido (espejo de src/lib/business.js).
// El tenant decide, por separado para la pagina de clientes y para caja, que
// campos se muestran, cuales son obligatorios y con que etiqueta, mas 2
// campos extra (custom1/custom2) con tipo elegible.
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'tel'];
export const ORDER_FORM_FIELD_DEFS = [
  { key: 'name',         kind: 'text',        defaultLabel: 'Nombre',          lockVisible: true },
  { key: 'phone',        kind: 'tel',         defaultLabel: 'WhatsApp' },
  { key: 'fulfillment',  kind: 'fulfillment', defaultLabel: 'Tipo de entrega' },
  { key: 'address',      kind: 'text',        defaultLabel: 'Direccion' },
  { key: 'neighborhood', kind: 'text',        defaultLabel: 'Colonia' },
  { key: 'sector',       kind: 'text',        defaultLabel: 'Sector' },
  { key: 'payment',      kind: 'payment',     defaultLabel: 'Forma de pago' },
  { key: 'note',         kind: 'textarea',    defaultLabel: 'Nota' },
  { key: 'custom1',      kind: 'custom',      defaultLabel: '' },
  { key: 'custom2',      kind: 'custom',      defaultLabel: '' },
];
const FORM_FIELD_DEFAULTS = {
  order: {
    name: { visible: true, required: true }, phone: { visible: true, required: true },
    fulfillment: { visible: true, required: true }, address: { visible: true, required: false },
    neighborhood: { visible: true, required: false }, sector: { visible: true, required: false },
    payment: { visible: true, required: true }, note: { visible: true, required: false },
    custom1: { visible: false, required: false }, custom2: { visible: false, required: false },
  },
  cashier: {
    name: { visible: true, required: false }, phone: { visible: true, required: false },
    fulfillment: { visible: false, required: false }, address: { visible: false, required: false },
    neighborhood: { visible: false, required: false }, sector: { visible: false, required: false },
    payment: { visible: false, required: false }, note: { visible: true, required: false },
    custom1: { visible: false, required: false }, custom2: { visible: false, required: false },
  },
};
function normalizeFieldEntry(def, raw, defaults) {
  const base = defaults || { visible: true, required: false };
  const entry = raw && typeof raw === 'object' ? raw : {};
  const hasLabel = String(entry.label ?? '').trim().length > 0;
  const result = {
    visible: def.lockVisible ? true : (entry.visible !== undefined ? Boolean(entry.visible) : base.visible),
    required: def.lockRequired ? true : (entry.required !== undefined ? Boolean(entry.required) : base.required),
    label: hasLabel ? String(entry.label).trim() : def.defaultLabel,
  };
  if (def.kind === 'custom') {
    result.type = CUSTOM_FIELD_TYPES.includes(entry.type) ? entry.type : 'text';
    if (!hasLabel) result.visible = false;
  }
  return result;
}
export function normalizeFormFields(raw = {}, context = 'order') {
  const defaults = FORM_FIELD_DEFAULTS[context] || FORM_FIELD_DEFAULTS.order;
  const out = {};
  for (const def of ORDER_FORM_FIELD_DEFS) out[def.key] = normalizeFieldEntry(def, raw?.[def.key], defaults[def.key]);
  return out;
}

export function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: normalizeBranchId(branch.id || branch.name, `sucursal-${index + 1}`),
        name: String(branch.name || branch.id || `Sucursal ${index + 1}`).trim() || `Sucursal ${index + 1}`,
        active: branch.active !== false,
        ordersPassword: String(branch.ordersPassword || branch.orders_password || '').trim(),
        stockPassword: String(branch.stockPassword || branch.stock_password || '').trim(),
        cashierPassword: String(branch.cashierPassword || branch.cashier_password || '').trim(),
        whatsappNumber: String(branch.whatsappNumber || branch.whatsapp_number || branch.whatsapp || '').trim(),
        businessHours: branch.businessHours || branch.business_hours || null,
        soldOut: branch.soldOut || branch.sold_out || {},
      }))
    : DEFAULT_BRANCH_SETTINGS.branches;
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || settings.default_branch_id || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId, DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const requestedDefaultSource = String(settings.defaultCashierOrderSource || settings.default_cashier_order_source || '').trim();
  const defaultCashierOrderSource = cashierOrderSources.includes(requestedDefaultSource)
    ? requestedDefaultSource
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return {
    multiBranchEnabled: Boolean(settings.multiBranchEnabled),
    defaultBranchId,
    cashierOrderSources,
    defaultCashierOrderSource,
    branches,
    orderFormFields: normalizeFormFields(settings.orderFormFields, 'order'),
    cashierFormFields: normalizeFormFields(settings.cashierFormFields, 'cashier'),
  };
}

export function publicBranchSettings(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return { ...normalized, branches: normalized.branches.map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch) };
}

export function hideBranchPasswords(settings = DEFAULT_BRANCH_SETTINGS) {
  return publicBranchSettings(settings);
}

export function selectedBranchFrom(settings, selectedBranchId) {
  const normalized = normalizeBranchSettings(settings);
  const active = normalized.branches.filter((branch) => branch.active !== false);
  return active.find((branch) => branch.id === selectedBranchId) || active.find((branch) => branch.id === normalized.defaultBranchId) || active[0] || normalized.branches[0] || DEFAULT_BRANCH_SETTINGS.branches[0];
}
