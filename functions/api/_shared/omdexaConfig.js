import { requireDb, nowIso } from './http.js';

export const OMDEXA_CONFIG_KEY = 'omdexa_landing_config';

// CORREGIDO: este objeto es el que REALMENTE se sirve en produccion --
// OmdexaLanding.jsx trae su propio DEFAULT_CONFIG (usado como estado
// inicial antes de que cargue la red), pero SIEMPRE lo sobreescribe con
// lo que devuelve GET /api/omdexa-config (ver mergeConfig() en
// OmdexaLanding.jsx), y este archivo es la fuente de ese endpoint. El
// rediseno "Tienda, CRM, inventario y pagos" (commit cb308a3) actualizo
// el DEFAULT_CONFIG del frontend pero nunca este archivo -- asi que en
// vivo se seguia viendo el copy viejo sin CRM. Mantener ambos objetos
// sincronizados a mano hasta que se unifiquen en un solo lugar.
export const DEFAULT_OMDEXA_CONFIG = {
  brandName: 'Omdexa',
  pageTitle: 'Omdexa | Tienda, CRM, inventario y pagos para tu negocio',
  metaDescription: 'Omdexa centraliza tienda en linea, CRM y seguimiento de clientes, caja, pedidos, inventario y pagos para pequenos negocios. Usa todo el sistema o solo el modulo que necesitas.',
  platformLinkLabel: 'Admin SaaS',
  topbarLabel: 'Portal de clientes',
  topbarStatus: 'Multi-tenant activo',
  nav: [
    { label: 'Modulos', href: '#ops', icon: 'chart' },
    { label: 'CRM', href: '#ops', icon: 'users' },
    { label: 'Acceso', href: '#access', icon: 'store' },
    { label: 'Contacto', href: '#contact', icon: 'phone' },
  ],
  hero: {
    eyebrow: 'Software para negocios locales',
    title: 'Tienda, CRM, inventario y pagos — usa todo, o solo lo que necesitas.',
    text: 'Omdexa es un sistema modular: negocios que venden en linea usan la operacion completa (tienda, caja, inventario por recetas y pagos), y negocios que solo necesitan dar seguimiento a sus clientes pueden usar unicamente el CRM. Tu eliges que prender.',
    imageUrl: '/omdexa-dashboard.svg',
    imageAlt: 'Panel operativo de Omdexa con pedidos, CRM, inventario y pagos',
    primaryActionLabel: 'Entrar a mi negocio',
    secondaryActionLabel: 'Ver todos los modulos',
    proofLabel: 'Hecho para operacion real',
    proofItems: ['CRM y seguimiento de clientes', 'Pedidos por tienda, caja y chat', 'Control de inventario en tiempo real'],
  },
  contact: {
    title: 'Hablemos de tu operacion',
    text: 'Agenda soporte, onboarding o una demo para configurar Omdexa alrededor de tu negocio — completo o solo el CRM.',
    phone: '+528113927548',
    whatsapp: '+528113927548',
    email: 'hola@omdexa.com',
    phoneLabel: '+52 811 392 7548',
    emailLabel: 'hola@omdexa.com',
  },
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
      { title: 'CRM', text: 'Historial, mensajes y seguimiento por cliente' },
      { title: 'Pedidos', text: 'Tienda, caja y canales externos' },
      { title: 'Inventario', text: 'Recetas, subrecetas y sucursales' },
      { title: 'Pagos', text: 'Mercado Pago por tenant' },
    ],
    flow: ['Cliente', 'CRM', 'Pedido', 'Pago', 'Stock'],
  },
  modules: [
    { icon: 'users', title: 'CRM y seguimiento', text: 'Historial de pedidos por cliente, mensajes de seguimiento y segmentacion. Funciona solo, sin necesidad de activar el resto del sistema.' },
    { icon: 'chat', title: 'Pedidos y tienda', text: 'Catalogo en linea, caja y pedidos por WhatsApp, Messenger e Instagram con el mismo precio siempre.' },
    { icon: 'package', title: 'Inventario', text: 'Control de stock por receta y sub-receta, por sucursal, sincronizado con cada pedido.' },
    { icon: 'wallet', title: 'Pagos conectados', text: 'Checkout Pro por cliente y webhooks para confirmar ordenes pagadas automaticamente.' },
  ],
};

function mergeConfig(value) {
  return {
    ...DEFAULT_OMDEXA_CONFIG,
    ...(value || {}),
    hero: {
      ...DEFAULT_OMDEXA_CONFIG.hero,
      ...(value?.hero || {}),
      proofItems: Array.isArray(value?.hero?.proofItems) ? value.hero.proofItems : DEFAULT_OMDEXA_CONFIG.hero.proofItems,
    },
    contact: { ...DEFAULT_OMDEXA_CONFIG.contact, ...(value?.contact || {}) },
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
