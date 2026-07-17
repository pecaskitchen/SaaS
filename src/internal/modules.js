// Mapa de modulos del backoffice unificado. Cada modulo declara que roles lo
// pueden ver; BackofficeShell.jsx filtra la barra lateral con esto.
//
// platform_admin no ve los modulos de un negocio. Tiene su propio modulo
// cross-tenant separado por seguridad operativa.
export const MODULES = [
  { id: 'inicio', label: 'Inicio', roles: ['admin', 'manager'] },
  { id: 'pedidos', label: 'Pedidos', roles: ['admin', 'manager', 'orders'] },
  { id: 'caja', label: 'Caja', roles: ['admin', 'manager', 'cashier'] },
  { id: 'cobranza', label: 'Cobranza', roles: ['admin', 'manager', 'orders', 'cashier', 'reports'] },
  { id: 'clientes', label: 'Clientes', roles: ['admin', 'manager', 'orders'] },
  { id: 'menu', label: 'Menu', roles: ['admin', 'manager'] },
  { id: 'inventario', label: 'Inventario', roles: ['admin', 'manager', 'inventory'] },
  { id: 'recetas', label: 'Recetas', roles: ['admin', 'manager'] },
  { id: 'reportes', label: 'Reportes', roles: ['admin', 'manager', 'reports'] },
  { id: 'historial', label: 'Ventas', roles: ['admin', 'manager', 'reports'] },
  { id: 'pagina-publica', label: 'Pagina publica', roles: ['platform_admin'] },
  { id: 'negocio', label: 'Negocio', roles: ['admin', 'manager'] },
  { id: 'integraciones', label: 'Integraciones', roles: ['admin'] },
  { id: 'usuarios', label: 'Usuarios', roles: ['admin'] },
  { id: 'plataforma', label: 'Plataforma', roles: ['platform_admin'] },
];

export const BUSINESS_TYPES = [
  { value: 'food', label: 'Gastronomico' },
  { value: 'retail', label: 'Retail / articulos' },
  { value: 'services', label: 'Servicios' },
  { value: 'custom', label: 'Personalizado' },
];

export const DEFAULT_MODULES_BY_BUSINESS_TYPE = {
  food: {
    inicio: true,
    pedidos: true,
    caja: true,
    cobranza: false,
    clientes: true,
    menu: true,
    inventario: true,
    recetas: true,
    reportes: true,
    'pagina-publica': true,
    negocio: true,
    integraciones: true,
    usuarios: true,
  },
  retail: {
    inicio: true,
    pedidos: true,
    caja: true,
    cobranza: true,
    clientes: true,
    menu: true,
    inventario: true,
    recetas: false,
    reportes: true,
    'pagina-publica': true,
    negocio: true,
    integraciones: true,
    usuarios: true,
  },
  services: {
    inicio: true,
    pedidos: false,
    caja: false,
    cobranza: true,
    clientes: true,
    menu: false,
    inventario: false,
    recetas: false,
    reportes: true,
    'pagina-publica': true,
    negocio: true,
    integraciones: true,
    usuarios: true,
  },
  custom: {
    inicio: true,
    pedidos: true,
    caja: true,
    cobranza: false,
    clientes: true,
    menu: true,
    inventario: true,
    recetas: false,
    reportes: true,
    'pagina-publica': true,
    negocio: true,
    integraciones: true,
    usuarios: true,
  },
};

const MODULE_LABELS_BY_BUSINESS_TYPE = {
  food: {
    menu: 'Menu',
    inventario: 'Inventario',
    recetas: 'Recetas',
    cobranza: 'Cobranza',
  },
  retail: {
    pedidos: 'Ventas',
    caja: 'Caja / venta',
    menu: 'Catalogo',
    inventario: 'Inventario',
    cobranza: 'Apartados y abonos',
    clientes: 'Clientes',
  },
  services: {
    pedidos: 'Solicitudes',
    menu: 'Servicios',
    cobranza: 'Cobranza',
    clientes: 'Clientes',
  },
  custom: {},
};

const DEFAULT_MODULE_BY_ROLE = {
  admin: 'inicio',
  manager: 'inicio',
  cashier: 'caja',
  orders: 'pedidos',
  inventory: 'inventario',
  reports: 'reportes',
  platform_admin: 'plataforma',
};

export function businessTypeFromSettings(settings = {}) {
  const value = String(settings.businessType || 'food').trim().toLowerCase();
  return DEFAULT_MODULES_BY_BUSINESS_TYPE[value] ? value : 'food';
}

export function moduleSettingsFromTenant(settings = {}) {
  const businessType = businessTypeFromSettings(settings);
  const defaults = DEFAULT_MODULES_BY_BUSINESS_TYPE[businessType] || DEFAULT_MODULES_BY_BUSINESS_TYPE.food;
  const source = settings.modules && typeof settings.modules === 'object' ? settings.modules : {};
  const modules = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) modules[key] = source[key] === true;
  }
  modules.inicio = true;
  modules.negocio = true;
  modules.usuarios = true;
  return modules;
}

export function labelModuleForBusiness(module, businessType) {
  return MODULE_LABELS_BY_BUSINESS_TYPE[businessType]?.[module.id] || module.label;
}

export function modulesForRole(role, settings = {}) {
  if (role === 'platform_admin') return MODULES.filter((module) => module.roles.includes(role));
  const businessType = businessTypeFromSettings(settings);
  const activeModules = moduleSettingsFromTenant(settings);
  return MODULES
    .filter((module) => module.roles.includes(role))
    .filter((module) => activeModules[module.id] !== false)
    .map((module) => ({ ...module, label: labelModuleForBusiness(module, businessType) }));
}

export function defaultModuleForRole(role, settings = {}) {
  const preferred = DEFAULT_MODULE_BY_ROLE[role];
  const visible = modulesForRole(role, settings);
  if (preferred && visible.some((module) => module.id === preferred)) {
    return preferred;
  }
  const first = visible[0];
  return first ? first.id : '';
}
