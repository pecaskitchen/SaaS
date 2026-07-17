export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const DEFAULT_BUSINESS_HOURS = {
  messageWhenClosed: 'Estamos cerrados. Puedes mandar tu pedido y lo tomamos cuando abramos.',
  allowClosedOrders: true,
  days: [
    { day: 0, active: true, open: '17:00', close: '23:00' },
    { day: 1, active: true, open: '17:00', close: '23:00' },
    { day: 2, active: true, open: '17:00', close: '23:00' },
    { day: 3, active: true, open: '17:00', close: '23:00' },
    { day: 4, active: true, open: '17:00', close: '23:00' },
    { day: 5, active: true, open: '17:00', close: '23:00' },
    { day: 6, active: true, open: '17:00', close: '23:00' },
  ],
};

export const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

export function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

// ---------------------------------------------------------------------------
// Campos configurables del formulario de pedido (por tenant y por contexto)
// ---------------------------------------------------------------------------
// Cada tenant decide, para la pagina publica de pedidos y para caja POR
// SEPARADO, que campos se muestran, cuales son obligatorios y con que
// etiqueta. Ademas hay 2 campos extra libres (custom1/custom2) con tipo
// elegible (texto/numero/telefono). "name" siempre es visible y obligatorio
// (identifica el pedido); solo su etiqueta es editable.

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'tel'];
export const CUSTOM_FIELD_KEYS = ['custom1', 'custom2'];

// Definicion de los campos estandar, en orden de despliegue.
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

// Defaults por contexto = comportamiento actual (nada cambia hasta editar).
const FORM_FIELD_DEFAULTS = {
  order: {
    name:         { visible: true,  required: true },
    phone:        { visible: true,  required: true },
    fulfillment:  { visible: true,  required: true },
    address:      { visible: true,  required: false },
    neighborhood: { visible: true,  required: false },
    sector:       { visible: true,  required: false },
    payment:      { visible: true,  required: true },
    note:         { visible: true,  required: false },
    custom1:      { visible: false, required: false },
    custom2:      { visible: false, required: false },
  },
  cashier: {
    name:         { visible: true,  required: false },
    phone:        { visible: true,  required: false },
    fulfillment:  { visible: false, required: false },
    address:      { visible: false, required: false },
    neighborhood: { visible: false, required: false },
    sector:       { visible: false, required: false },
    payment:      { visible: false, required: false },
    note:         { visible: true,  required: false },
    custom1:      { visible: false, required: false },
    custom2:      { visible: false, required: false },
  },
};

function normalizeFieldEntry(def, raw, defaults) {
  const base = defaults || { visible: true, required: false };
  const entry = raw && typeof raw === 'object' ? raw : {};
  const hasLabel = String(entry.label ?? '').trim().length > 0;
  const visible = def.lockVisible ? true : (entry.visible !== undefined ? Boolean(entry.visible) : base.visible);
  const required = def.lockRequired ? true : (entry.required !== undefined ? Boolean(entry.required) : base.required);
  const result = {
    visible,
    required,
    label: hasLabel ? String(entry.label).trim() : def.defaultLabel,
  };
  if (def.kind === 'custom') {
    result.type = CUSTOM_FIELD_TYPES.includes(entry.type) ? entry.type : 'text';
    // Un campo extra sin etiqueta no puede mostrarse (no tendria nombre).
    if (!hasLabel) result.visible = false;
  }
  return result;
}

export function normalizeFormFields(raw = {}, context = 'order') {
  const defaults = FORM_FIELD_DEFAULTS[context] || FORM_FIELD_DEFAULTS.order;
  const out = {};
  for (const def of ORDER_FORM_FIELD_DEFS) {
    out[def.key] = normalizeFieldEntry(def, raw?.[def.key], defaults[def.key]);
  }
  return out;
}

// Mapea la key del campo al valor dentro del objeto customer del formulario.
export function customerFieldValue(customer = {}, key) {
  switch (key) {
    case 'name': return customer.name;
    case 'phone': return customer.phone;
    case 'fulfillment': return customer.fulfillmentType;
    case 'address': return customer.address;
    case 'neighborhood': return customer.neighborhood;
    case 'sector': return customer.sector;
    case 'payment': return customer.payment;
    case 'note': return customer.orderNote;
    case 'custom1': return customer.custom1;
    case 'custom2': return customer.custom2;
    default: return '';
  }
}

// address es obligatorio si el tenant lo marco, o si es entrega a domicilio
// (y el campo de tipo de entrega esta visible).
export function isFieldRequired(fieldKey, config, customer = {}) {
  const field = config?.[fieldKey];
  if (!field || !field.visible) return false;
  if (fieldKey === 'address' && config?.fulfillment?.visible && customer.fulfillmentType === 'Entrega a domicilio') return true;
  return Boolean(field.required);
}

// Etiqueta del primer campo obligatorio sin llenar, o null si todo esta ok.
export function firstMissingRequiredField(customer = {}, config = {}) {
  for (const def of ORDER_FORM_FIELD_DEFS) {
    const field = config?.[def.key];
    if (!field || !field.visible) continue;
    if (!isFieldRequired(def.key, config, customer)) continue;
    if (!String(customerFieldValue(customer, def.key) ?? '').trim()) return field.label || def.defaultLabel;
  }
  return null;
}

// Lineas "Etiqueta: valor" de los 2 campos extra visibles con valor.
export function customFieldLines(customer = {}, config = {}) {
  const lines = [];
  for (const key of CUSTOM_FIELD_KEYS) {
    const field = config?.[key];
    const value = String(customerFieldValue(customer, key) ?? '').trim();
    if (field?.visible && value) lines.push(`${field.label}: ${value}`);
  }
  return lines;
}

// Estructura para persistir en el pedido (custom_fields_json).
export function customFieldsPayload(customer = {}, config = {}) {
  const out = [];
  for (const key of CUSTOM_FIELD_KEYS) {
    const field = config?.[key];
    const value = String(customerFieldValue(customer, key) ?? '').trim();
    if (field?.visible && value) out.push({ key, label: field.label, type: field.type || 'text', value });
  }
  return out;
}

export const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

export const BRANCH_STORAGE_KEY = 'saas_selected_branch';

export function normalizeWhatsAppNumber(value, fallback = '') {
  const raw = String(value || fallback || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  return digits || String(fallback || '').replace(/[^0-9]/g, '');
}

export function normalizeBranchId(value, fallback = 'sucursal') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
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
    // Resaltar la colonia en las tarjetas de pedido (util para negocios con
    // reparto, como Pecas; otros lo dejan apagado).
    highlightNeighborhood: Boolean(settings.highlightNeighborhood),
    // Corte de ventas para Inicio: dia de inicio de semana (0=domingo..6=sabado,
    // default 1=lunes) y dia de inicio de mes (1..28, default 1=calendario).
    salesWeekStartDay: normalizeWeekStartDay(settings.salesWeekStartDay),
    salesMonthStartDay: normalizeMonthStartDay(settings.salesMonthStartDay),
  };
}

export function normalizeWeekStartDay(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 1;
}

export function normalizeMonthStartDay(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : 1;
}

export function activeBranches(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return normalized.branches.filter((branch) => branch.active !== false);
}

export function selectedBranchFrom(settings, selectedBranchId) {
  const normalized = normalizeBranchSettings(settings);
  const available = activeBranches(normalized);
  return available.find((branch) => branch.id === selectedBranchId)
    || available.find((branch) => branch.id === normalized.defaultBranchId)
    || available[0]
    || normalized.branches[0]
    || DEFAULT_BRANCH_SETTINGS.branches[0];
}

export function normalizeBusinessHours(hours = {}) {
  const byDay = new Map((Array.isArray(hours.days) ? hours.days : []).map((row) => [Number(row.day), row]));
  return {
    ...DEFAULT_BUSINESS_HOURS,
    ...(hours || {}),
    allowClosedOrders: hours.allowClosedOrders !== undefined ? Boolean(hours.allowClosedOrders) : DEFAULT_BUSINESS_HOURS.allowClosedOrders,
    messageWhenClosed: hours.messageWhenClosed || DEFAULT_BUSINESS_HOURS.messageWhenClosed,
    days: DEFAULT_BUSINESS_HOURS.days.map((fallback) => {
      const saved = byDay.get(fallback.day) || {};
      return {
        day: fallback.day,
        active: saved.active !== undefined ? Boolean(saved.active) : fallback.active,
        open: saved.open || fallback.open,
        close: saved.close || fallback.close,
      };
    }),
  };
}

export function timeToMinutes(value) {
  const [hh, mm] = String(value || '').split(':').map((part) => Number(part));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function formatHour(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value || '';
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const displayHour = hh % 12 || 12;
  return `${displayHour}:${String(mm).padStart(2, '0')} ${suffix}`;
}

// CORREGIDO: antes usaba new Date().getDay()/getHours() -- la hora LOCAL
// del dispositivo del cliente, no la de la tienda. Si el celular del
// cliente tiene otra zona horaria (o el reloj mal puesto), el estado
// abierto/cerrado quedaba mal sin importar el horario configurado. El
// backend siempre calcula todo en America/Monterrey (ver
// getBusinessWindowMonterrey en orders-dashboard.js); aqui hacemos lo
// mismo del lado del cliente.
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function monterreyNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Monterrey',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // algunos motores formatean medianoche como "24"
  return { day: WEEKDAY_INDEX[map.weekday], minutes: hour * 60 + Number(map.minute) };
}

export function businessStatus(hours = DEFAULT_BUSINESS_HOURS) {
  const normalized = normalizeBusinessHours(hours);
  const { day: currentDay, minutes: current } = monterreyNow();
  const today = normalized.days.find((day) => day.day === currentDay);
  if (!today?.active) return { open: false, label: 'Cerrado hoy' };
  const open = timeToMinutes(today.open);
  const close = timeToMinutes(today.close);
  if (open === null || close === null) return { open: false, label: 'Horario no configurado' };
  const isOpen = close > open ? current >= open && current < close : current >= open || current < close;
  return {
    open: isOpen,
    label: isOpen ? `Abierto ahora · cerramos ${formatHour(today.close)}` : `Cerrado · abrimos ${formatHour(today.open)}`,
    messageWhenClosed: normalized.messageWhenClosed,
    allowClosedOrders: normalized.allowClosedOrders,
  };
}



