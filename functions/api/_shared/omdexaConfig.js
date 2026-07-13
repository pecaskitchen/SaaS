import { requireDb, nowIso } from './http.js';

export const OMDEXA_CONFIG_KEY = 'omdexa_landing_config';

export const DEFAULT_OMDEXA_CONFIG = {
  brandName: 'Omdexa',
  platformLinkLabel: 'Admin SaaS',
  topbarLabel: 'Portal de clientes',
  topbarStatus: 'Multi-tenant activo',
  nav: [
    { label: 'Acceso', href: '#access', icon: 'store' },
    { label: 'Plataforma', href: '#platform', icon: 'shield' },
    { label: 'Operacion', href: '#ops', icon: 'chart' },
  ],
  access: {
    eyebrow: 'Entrar al ambiente',
    title: 'Abre la tienda o el panel de tu negocio.',
    text: 'Usa el nombre corto o dominio del cliente. Omdexa resuelve el tenant correcto y te lleva a su ambiente aislado.',
    inputLabel: 'Negocio',
    inputPlaceholder: 'pecas, pecas.mx, flilians...',
    storeButton: 'Abrir tienda',
    adminButton: 'Entrar a admin',
    emptyStatus: 'Escribe el nombre o dominio de tu negocio.',
    searchingStatus: 'Buscando ambiente...',
  },
  live: {
    title: 'Omdexa OS',
    badge: 'Live',
    signals: [
      { title: 'Pedidos', text: 'Tienda, caja y canales externos' },
      { title: 'Inventario', text: 'Recetas, subrecetas y sucursales' },
      { title: 'Pagos', text: 'Mercado Pago por tenant' },
    ],
    flow: ['Cliente', 'Pago', 'Orden', 'Stock'],
  },
  modules: [
    { icon: 'building', title: 'Clientes separados', text: 'Cada tenant conserva marca, datos, sucursales y configuracion propia.' },
    { icon: 'package', title: 'Operacion completa', text: 'Catalogo, pedidos, caja, ordenes, stock y reportes en una sola base.' },
    { icon: 'wallet', title: 'Pagos conectados', text: 'Checkout Pro por cliente y webhooks para confirmar ordenes pagadas.' },
  ],
};

function mergeConfig(value) {
  return {
    ...DEFAULT_OMDEXA_CONFIG,
    ...(value || {}),
    access: { ...DEFAULT_OMDEXA_CONFIG.access, ...(value?.access || {}) },
    live: {
      ...DEFAULT_OMDEXA_CONFIG.live,
      ...(value?.live || {}),
      signals: Array.isArray(value?.live?.signals) ? value.live.signals : DEFAULT_OMDEXA_CONFIG.live.signals,
      flow: Array.isArray(value?.live?.flow) ? value.live.flow : DEFAULT_OMDEXA_CONFIG.live.flow,
    },
    nav: Array.isArray(value?.nav) ? value.nav : DEFAULT_OMDEXA_CONFIG.nav,
    modules: Array.isArray(value?.modules) ? value.modules : DEFAULT_OMDEXA_CONFIG.modules,
  };
}

export async function readOmdexaConfig(env) {
  const db = requireDb(env);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  const row = await db.prepare(`SELECT value_json FROM app_settings WHERE key = ?`).bind(OMDEXA_CONFIG_KEY).first();
  if (!row?.value_json) return mergeConfig(null);
  try {
    return mergeConfig(JSON.parse(row.value_json));
  } catch {
    return mergeConfig(null);
  }
}

export async function saveOmdexaConfig(env, config) {
  const db = requireDb(env);
  const merged = mergeConfig(config);
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).bind(OMDEXA_CONFIG_KEY, JSON.stringify(merged), nowIso()).run();
  return merged;
}
