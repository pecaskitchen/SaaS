export const BUSINESS_TYPES = [
  { value: 'food', label: 'Restaurante / cafetería' },
  { value: 'floral', label: 'Florería / regalos' },
  { value: 'retail', label: 'Tienda / retail' },
  { value: 'services', label: 'Servicios / citas' },
  { value: 'distribution', label: 'Distribución / mayoreo' },
  { value: 'custom', label: 'Personalizado' },
];

const always = {
  inicio: true,
  clientes: true,
  reportes: true,
  historial: true,
  negocio: true,
  integraciones: true,
  usuarios: true,
};

export const DEFAULT_MODULES_BY_BUSINESS_TYPE = {
  food: { ...always, pedidos: true, caja: true, cobranza: false, menu: true, inventario: true, recetas: true },
  floral: { ...always, pedidos: true, caja: true, cobranza: false, menu: true, inventario: true, recetas: false },
  retail: { ...always, pedidos: true, caja: true, cobranza: true, menu: true, inventario: true, recetas: false },
  services: { ...always, pedidos: true, caja: true, cobranza: true, menu: true, inventario: false, recetas: false },
  distribution: { ...always, pedidos: true, caja: false, cobranza: true, menu: true, inventario: true, recetas: false },
  custom: { ...always, pedidos: true, caja: true, cobranza: false, menu: true, inventario: true, recetas: false },
};

export function normalizeBusinessType(value, fallback = 'food') {
  const clean = String(value || fallback || 'food').trim().toLowerCase();
  return DEFAULT_MODULES_BY_BUSINESS_TYPE[clean] ? clean : 'food';
}

export function defaultModulesForBusinessType(value) {
  return { ...DEFAULT_MODULES_BY_BUSINESS_TYPE[normalizeBusinessType(value)] };
}

export function normalizeModuleSettings(value, businessType = 'food') {
  const defaults = defaultModulesForBusinessType(businessType);
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const next = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = source[key] === true;
  }
  next.inicio = true;
  next.negocio = true;
  next.usuarios = true;
  return next;
}

export const MODULE_LABELS_BY_BUSINESS_TYPE = {
  food: { pedidos: 'Pedidos', caja: 'Caja', menu: 'Menú', inventario: 'Inventario', recetas: 'Recetas', historial: 'Ventas' },
  floral: { pedidos: 'Pedidos y entregas', caja: 'Caja', menu: 'Arreglos', inventario: 'Insumos', historial: 'Ventas' },
  retail: { pedidos: 'Pedidos', caja: 'Punto de venta', menu: 'Catálogo', inventario: 'Inventario', cobranza: 'Apartados y abonos', historial: 'Historial de ventas' },
  services: { pedidos: 'Agenda y solicitudes', caja: 'Cobros', menu: 'Servicios', cobranza: 'Cuentas por cobrar', historial: 'Servicios realizados' },
  distribution: { pedidos: 'Pedidos', caja: 'Ventas', menu: 'Productos', cobranza: 'Crédito y cobranza', historial: 'Ventas' },
  custom: {},
};
