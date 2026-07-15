// Mapa de modulos del backoffice unificado. Cada modulo declara que roles lo
// pueden ver; BackofficeShell.jsx filtra la barra lateral con esto.
//
// platform_admin no ve los modulos de un negocio. Tiene su propio modulo
// cross-tenant separado por seguridad operativa.
export const MODULES = [
  { id: 'inicio', label: 'Inicio', roles: ['admin', 'manager'] },
  { id: 'pedidos', label: 'Pedidos', roles: ['admin', 'manager', 'orders'] },
  { id: 'caja', label: 'Caja', roles: ['admin', 'manager', 'cashier'] },
  { id: 'clientes', label: 'Clientes', roles: ['admin', 'manager', 'orders'] },
  { id: 'menu', label: 'Menu', roles: ['admin', 'manager'] },
  { id: 'inventario', label: 'Inventario', roles: ['admin', 'manager', 'inventory'] },
  { id: 'reportes', label: 'Reportes', roles: ['admin', 'manager', 'reports'] },
  { id: 'pagina-publica', label: 'Pagina publica', roles: ['admin', 'manager'] },
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

export function modulesForRole(role) {
  return MODULES.filter((module) => module.roles.includes(role));
}

export function defaultModuleForRole(role) {
  const preferred = DEFAULT_MODULE_BY_ROLE[role];
  if (preferred && MODULES.some((module) => module.id === preferred && module.roles.includes(role))) {
    return preferred;
  }
  const first = modulesForRole(role)[0];
  return first ? first.id : '';
}
