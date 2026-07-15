export const BUSINESS_TYPES = ['food', 'retail', 'services', 'custom'];

export const DEFAULT_MODULES_BY_BUSINESS_TYPE = {
  food: {
    inicio: true,
    pedidos: true,
    caja: true,
    clientes: true,
    menu: true,
    inventario: true,
    recetas: true,
    cobranza: false,
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
    clientes: true,
    menu: true,
    inventario: true,
    recetas: false,
    cobranza: true,
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
    clientes: true,
    menu: false,
    inventario: false,
    recetas: false,
    cobranza: true,
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
    clientes: true,
    menu: true,
    inventario: true,
    recetas: false,
    cobranza: false,
    reportes: true,
    'pagina-publica': true,
    negocio: true,
    integraciones: true,
    usuarios: true,
  },
};

export function normalizeBusinessType(value, fallback = 'food') {
  const clean = String(value || fallback || 'food').trim().toLowerCase();
  return BUSINESS_TYPES.includes(clean) ? clean : 'food';
}

export function defaultModulesForBusinessType(type) {
  return { ...(DEFAULT_MODULES_BY_BUSINESS_TYPE[normalizeBusinessType(type)] || DEFAULT_MODULES_BY_BUSINESS_TYPE.food) };
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

export function normalizeTenantSettings(settings = {}, incoming = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(incoming, key);
  const businessType = normalizeBusinessType(
    has('businessType') ? incoming.businessType : settings.businessType,
    settings.businessType || 'food',
  );
  return {
    businessType,
    modules: normalizeModuleSettings(has('modules') ? incoming.modules : settings.modules, businessType),
  };
}
