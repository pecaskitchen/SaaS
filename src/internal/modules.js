import {
  BUSINESS_TYPES,
  DEFAULT_MODULES_BY_BUSINESS_TYPE,
  MODULE_LABELS_BY_BUSINESS_TYPE,
  normalizeBusinessType,
  normalizeModuleSettings,
} from '../../shared/modules.js';

export { BUSINESS_TYPES, DEFAULT_MODULES_BY_BUSINESS_TYPE };

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
  { id: 'negocio', label: 'Negocio', roles: ['admin', 'manager'] },
  { id: 'integraciones', label: 'Integraciones', roles: ['admin'] },
  { id: 'usuarios', label: 'Usuarios', roles: ['admin'] },
  { id: 'plataforma', label: 'Plataforma', roles: ['platform_admin'] },
];

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
  return normalizeBusinessType(settings.businessType);
}

export function moduleSettingsFromTenant(settings = {}) {
  const businessType = businessTypeFromSettings(settings);
  return normalizeModuleSettings(settings.modules, businessType);
}

export function labelModuleForBusiness(module, businessType) {
  return MODULE_LABELS_BY_BUSINESS_TYPE[businessType]?.[module.id] || module.label;
}

export function modulesForRole(role, settings = {}, hasTenantContext = false) {
  if (role === 'platform_admin' && !hasTenantContext) return MODULES.filter((module) => module.roles.includes(role));
  const businessType = businessTypeFromSettings(settings);
  const activeModules = moduleSettingsFromTenant(settings);
  if (role === 'platform_admin') {
    return MODULES
      .filter((module) => module.id === 'plataforma' || activeModules[module.id] !== false)
      .map((module) => ({ ...module, label: labelModuleForBusiness(module, businessType) }));
  }
  return MODULES
    .filter((module) => module.roles.includes(role))
    .filter((module) => activeModules[module.id] !== false)
    .map((module) => ({ ...module, label: labelModuleForBusiness(module, businessType) }));
}

export function defaultModuleForRole(role, settings = {}, hasTenantContext = false) {
  if (role === 'platform_admin' && hasTenantContext) return 'inicio';
  const preferred = DEFAULT_MODULE_BY_ROLE[role];
  const visible = modulesForRole(role, settings, hasTenantContext);
  if (preferred && visible.some((module) => module.id === preferred)) {
    return preferred;
  }
  const first = visible[0];
  return first ? first.id : '';
}
