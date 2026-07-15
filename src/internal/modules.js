// Mapa de modulos del backoffice unificado (ver plan de rediseno de
// roles/menus/login). Cada modulo declara que roles lo pueden ver; el shell
// (BackofficeShell.jsx) filtra la barra lateral con esto.
//
// platform_admin NO ve los modulos de un negocio (Pedidos, Caja, etc.) --
// tiene su propio modulo "plataforma" cross-tenant, separado a proposito
// (ver "Riesgo operativo" del plan). Los allow-lists del backend
// (requireAuth) son mas permisivos que esto a proposito, por compatibilidad;
// este mapa es solo de navegacion/UX.
export const MODULES = [
  { id: 'inicio', label: 'Inicio', roles: ['admin', 'manager'] },
  { id: 'pedidos', label: 'Pedidos', roles: ['admin', 'manager', 'orders'] },
  { id: 'caja', label: 'Caja', roles: ['admin', 'manager', 'cashier'] },
  { id: 'menu', label: 'Menú', roles: ['admin', 'manager'] },
  { id: 'inventario', label: 'Inventario', roles: ['admin', 'manager', 'inventory'] },
  { id: 'clientes', label: 'Clientes', roles: ['admin', 'manager', 'orders'] },
  { id: 'reportes', label: 'Reportes', roles: ['admin', 'manager', 'reports'] },
  { id: 'configuracion', label: 'Configuración', roles: ['admin'] },
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
