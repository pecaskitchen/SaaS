import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, Upload } from 'lucide-react';
import { apiFetch, getSessionToken } from '../lib/apiClient.js';
import {
  BUSINESS_TYPES,
  DEFAULT_MODULES_BY_BUSINESS_TYPE,
  MODULES,
  businessTypeFromSettings,
  labelModuleForBusiness,
  moduleSettingsFromTenant,
} from './modules.js';

const THEMES = ['neutral', 'gastro', 'floral', 'boutique', 'premium'];

const CUSTOM_BRAND_ALIASES = {
  nombre: 'displayName',
  nombre_visible: 'displayName',
  displayName: 'displayName',
  subtitulo: 'tagline',
  tagline: 'tagline',
  logo: 'logoUrl',
  logoUrl: 'logoUrl',
  imagen: 'heroImageUrl',
  imagen_portada: 'heroImageUrl',
  heroImageUrl: 'heroImageUrl',
  estilo: 'themePreset',
  themePreset: 'themePreset',
  eyebrow: 'heroEyebrow',
  heroEyebrow: 'heroEyebrow',
  titulo: 'heroTitle',
  titulo_portada: 'heroTitle',
  heroTitle: 'heroTitle',
  texto: 'heroText',
  texto_portada: 'heroText',
  heroText: 'heroText',
  boton_principal: 'primaryActionLabel',
  primaryActionLabel: 'primaryActionLabel',
  boton_carrito: 'secondaryActionLabel',
  secondaryActionLabel: 'secondaryActionLabel',
  mensaje_whatsapp: 'orderMessageIntro',
  orderMessageIntro: 'orderMessageIntro',
  etiqueta_catalogo: 'menuEyebrow',
  menuEyebrow: 'menuEyebrow',
  pestana: 'menuTitle',
  pestaña: 'menuTitle',
  titulo_catalogo: 'menuTitle',
  menuTitle: 'menuTitle',
  titulo_sin_productos: 'emptyCatalogTitle',
  emptyCatalogTitle: 'emptyCatalogTitle',
  texto_sin_productos: 'emptyCatalogText',
  emptyCatalogText: 'emptyCatalogText',
  color_principal: 'primaryColor',
  primaryColor: 'primaryColor',
  color_acento: 'accentColor',
  accentColor: 'accentColor',
};

function csvToList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function parseCustomBrandImport(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Pega un JSON de customizacion.');
  const parsed = JSON.parse(raw);
  const source = parsed.brand && typeof parsed.brand === 'object' ? parsed.brand : parsed;
  const mapped = {};
  for (const [key, value] of Object.entries(source || {})) {
    const target = CUSTOM_BRAND_ALIASES[key] || CUSTOM_BRAND_ALIASES[String(key).trim()] || key;
    if (Object.prototype.hasOwnProperty.call(emptyDraft.brand, target) && value !== undefined && value !== null) {
      mapped[target] = String(value);
    }
  }
  if (Object.keys(mapped).length === 0) throw new Error('No encontre campos custom validos en el JSON.');
  return mapped;
}

function platformToken() {
  try {
    return window.sessionStorage.getItem('platform_admin_token') || '';
  } catch {
    return '';
  }
}

// Rediseno de roles: si no hay token estatico de plataforma pero si una
// sesion JWT unificada (login nuevo), se manda tambien como Bearer -- el
// backend acepta cualquiera de los dos (ver requirePlatformAdmin en
// _shared/auth.js). Coexisten, no se retira el token estatico.
async function platformFetch(path, options = {}) {
  const staticToken = platformToken();
  const sessionToken = getSessionToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(staticToken ? { 'x-platform-admin-token': staticToken } : {}),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.detail || data.error || 'Error de plataforma.');
  return data;
}

const emptyDraft = {
  id: '',
  name: '',
  legalName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  status: 'active',
  plan: 'starter',
  domain: '',
  subdomain: '',
  notes: '',
  brand: {
    themePreset: 'neutral',
    displayName: '',
    tagline: '',
    pageTitle: '',
    metaDescription: '',
    logoUrl: '',
    heroImageUrl: '',
    heroEyebrow: '',
    heroTitle: '',
    heroText: '',
    primaryActionLabel: '',
    secondaryActionLabel: '',
    orderMessageIntro: '',
    menuEyebrow: '',
    menuTitle: '',
    emptyCatalogTitle: '',
    emptyCatalogText: '',
    primaryColor: '#111827',
    accentColor: '#ef4444',
  },
  settings: {
    businessType: 'food',
    modules: DEFAULT_MODULES_BY_BUSINESS_TYPE.food,
    timezone: 'America/Mexico_City',
    whatsappNumber: '',
    supportEmail: '',
    paymentMethods: ['Efectivo', 'Transferencia', 'Mercado Pago'],
    fulfillmentTypes: ['Recoger', 'Entrega a domicilio'],
    orderSources: ['Tienda', 'WhatsApp', 'Facebook', 'Instagram', 'Llamada'],
  },
};

export default function BusinessConfigCenter({
  tenantId = '',
  section = 'all',
  title = '',
  description = '',
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [customImportText, setCustomImportText] = useState('');

  function patch(path, value) {
    setDraft((current) => {
      const next = structuredClone(current);
      let target = next;
      for (let i = 0; i < path.length - 1; i += 1) target = target[path[i]];
      target[path[path.length - 1]] = value;
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = tenantId
        ? await platformFetch(`/api/platform/config-center?tenant_id=${encodeURIComponent(tenantId)}`)
        : await apiFetch('/api/business-config');
      const tenantSettings = { ...emptyDraft.settings, ...(data.tenant?.settings || {}) };
      const businessType = businessTypeFromSettings(tenantSettings);
      setDraft({
        ...emptyDraft,
        ...(data.tenant || {}),
        brand: { ...emptyDraft.brand, ...(data.tenant?.brand || {}) },
        settings: {
          ...tenantSettings,
          businessType,
          modules: moduleSettingsFromTenant({ ...tenantSettings, businessType }),
        },
      });
    } catch (err) {
      setError(err.message || 'No se pudo cargar configuracion.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const showPublicPage = section === 'all' || section === 'public';
      const showBusiness = section === 'all' || section === 'business';
      const nextSettings = {};
      if (showBusiness) {
        nextSettings.businessType = businessTypeFromSettings(draft.settings);
        nextSettings.modules = moduleSettingsFromTenant(draft.settings);
        nextSettings.timezone = draft.settings.timezone;
        nextSettings.whatsappNumber = draft.settings.whatsappNumber;
        nextSettings.supportEmail = draft.settings.supportEmail;
        nextSettings.paymentMethods = csvToList(draft.settings.paymentMethodsText || listToCsv(draft.settings.paymentMethods));
        nextSettings.fulfillmentTypes = csvToList(draft.settings.fulfillmentTypesText || listToCsv(draft.settings.fulfillmentTypes));
      }
      if (section === 'all') {
        nextSettings.orderSources = csvToList(draft.settings.orderSourcesText || listToCsv(draft.settings.orderSources));
      }
      const payload = {
        tenantId: draft.id || tenantId,
        brand: showPublicPage ? draft.brand : {},
        settings: nextSettings,
      };
      const request = {
        method: 'PATCH',
        body: JSON.stringify(payload),
      };
      if (tenantId) await platformFetch('/api/platform/config-center', request);
      else await apiFetch('/api/business-config', request);
      setSaved('Configuracion guardada.');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  function applyCustomImport() {
    try {
      const mapped = parseCustomBrandImport(customImportText);
      setDraft((current) => ({ ...current, brand: { ...current.brand, ...mapped } }));
      setSaved('Customizacion importada. Revisa y guarda.');
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo importar customizacion.');
      setSaved('');
    }
  }

  useEffect(() => { load(); }, [tenantId]);

  const showPublicPage = section === 'all' || section === 'public';
  const showBusiness = section === 'all' || section === 'business';
  const showOrderSources = section === 'all';
  // Solo el dueno de Omdexa (modo plataforma: se abre con tenantId desde el
  // panel de Plataforma) controla el tipo de negocio y los modulos activos.
  // El admin/gerente del negocio no los ve ni los cambia.
  const isPlatformMode = Boolean(tenantId);
  const eyebrow = section === 'public' ? 'Pagina publica' : section === 'business' ? 'Negocio' : 'Marca y operacion';
  const heading = title || (section === 'public' ? 'Pagina publica' : section === 'business' ? 'Ajustes del negocio' : 'Centro de configuracion');
  const helper = description || (section === 'public'
    ? 'Controla la portada, estilo visual, textos y etiquetas que ve el cliente.'
    : section === 'business'
      ? 'Configura contacto operativo, formas de pago, tipos de entrega y origenes de pedido.'
      : 'Configura marca publica y operacion del negocio.');
  const selectedBusinessType = businessTypeFromSettings(draft.settings);
  const activeModules = moduleSettingsFromTenant(draft.settings);

  function setBusinessType(value) {
    const businessType = businessTypeFromSettings({ businessType: value });
    patch(['settings', 'businessType'], businessType);
    patch(['settings', 'modules'], { ...DEFAULT_MODULES_BY_BUSINESS_TYPE[businessType] });
  }

  function toggleModule(moduleId) {
    if (['inicio', 'negocio', 'usuarios'].includes(moduleId)) return;
    patch(['settings', 'modules'], { ...activeModules, [moduleId]: !activeModules[moduleId] });
  }

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{heading}</h2>
          <p className="muted-line">{helper}</p>
          <p className="muted-line">{draft.name || draft.slug || tenantId}</p>
        </div>
        <div className="button-row">
          <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar"><RefreshCw size={18} /></button>
          <button type="button" className="primary" onClick={save} disabled={saving}><Save size={16} /> Guardar</button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="form-success">{saved}</p> : null}

      {showPublicPage && (
        <>
          <h3>Portada y estilo</h3>
          <div className="form-grid two">
            <label className="field"><span>Estilo visual</span><select value={draft.brand.themePreset} onChange={(event) => patch(['brand', 'themePreset'], event.target.value)}>{THEMES.map((theme) => <option key={theme}>{theme}</option>)}</select></label>
            <label className="field"><span>Nombre visible</span><input value={draft.brand.displayName} onChange={(event) => patch(['brand', 'displayName'], event.target.value)} /></label>
            <label className="field"><span>Tagline</span><input value={draft.brand.tagline} onChange={(event) => patch(['brand', 'tagline'], event.target.value)} /></label>
            <label className="field wide"><span>Titulo de la pestaña (storefront)</span><input value={draft.brand.pageTitle || ''} onChange={(event) => patch(['brand', 'pageTitle'], event.target.value)} placeholder="Ej. Pecas · Crepas y café a domicilio" /></label>
            <label className="field wide"><span>Descripción SEO (meta description)</span><input value={draft.brand.metaDescription || ''} onChange={(event) => patch(['brand', 'metaDescription'], event.target.value)} placeholder="Vacío = usa el tagline" /></label>
            <label className="field"><span>Logo URL</span><input value={draft.brand.logoUrl} onChange={(event) => patch(['brand', 'logoUrl'], event.target.value)} /></label>
            <label className="field"><span>Imagen portada URL</span><input value={draft.brand.heroImageUrl} onChange={(event) => patch(['brand', 'heroImageUrl'], event.target.value)} /></label>
            <label className="field"><span>Etiqueta portada</span><input value={draft.brand.heroEyebrow} onChange={(event) => patch(['brand', 'heroEyebrow'], event.target.value)} /></label>
            <label className="field"><span>Titulo portada</span><input value={draft.brand.heroTitle} onChange={(event) => patch(['brand', 'heroTitle'], event.target.value)} /></label>
            <label className="field wide"><span>Texto portada</span><textarea value={draft.brand.heroText} onChange={(event) => patch(['brand', 'heroText'], event.target.value)} /></label>
            <label className="field"><span>Boton principal</span><input value={draft.brand.primaryActionLabel} onChange={(event) => patch(['brand', 'primaryActionLabel'], event.target.value)} /></label>
            <label className="field"><span>Boton carrito</span><input value={draft.brand.secondaryActionLabel} onChange={(event) => patch(['brand', 'secondaryActionLabel'], event.target.value)} /></label>
            <label className="field wide"><span>Mensaje WhatsApp</span><input value={draft.brand.orderMessageIntro} onChange={(event) => patch(['brand', 'orderMessageIntro'], event.target.value)} /></label>
            <label className="field"><span>Etiqueta menu</span><input value={draft.brand.menuEyebrow} onChange={(event) => patch(['brand', 'menuEyebrow'], event.target.value)} /></label>
            <label className="field"><span>Titulo menu</span><input value={draft.brand.menuTitle} onChange={(event) => patch(['brand', 'menuTitle'], event.target.value)} /></label>
            <label className="field"><span>Titulo sin productos</span><input value={draft.brand.emptyCatalogTitle} onChange={(event) => patch(['brand', 'emptyCatalogTitle'], event.target.value)} /></label>
            <label className="field"><span>Texto sin productos</span><input value={draft.brand.emptyCatalogText} onChange={(event) => patch(['brand', 'emptyCatalogText'], event.target.value)} /></label>
            <label className="field"><span>Color principal</span><input value={draft.brand.primaryColor} onChange={(event) => patch(['brand', 'primaryColor'], event.target.value)} /></label>
            <label className="field"><span>Color acento</span><input value={draft.brand.accentColor} onChange={(event) => patch(['brand', 'accentColor'], event.target.value)} /></label>
            <label className="field wide"><span>Import custom JSON</span><textarea rows="5" value={customImportText} onChange={(event) => setCustomImportText(event.target.value)} placeholder={'{"titulo":"Arreglos para hoy","texto":"Pedidos por WhatsApp","pestana":"Catalogo floral"}'} /></label>
            <div className="field wide">
              <button type="button" className="ghost small" onClick={applyCustomImport}><Upload size={16} /> Importar custom</button>
            </div>
          </div>
        </>
      )}

      {showBusiness && (
        <>
          <h3>Operacion</h3>
          <div className="form-grid two">
            {isPlatformMode ? <label className="field"><span>Tipo de negocio</span><select value={selectedBusinessType} onChange={(event) => setBusinessType(event.target.value)}>{BUSINESS_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label> : null}
            <label className="field"><span>WhatsApp principal</span><input value={draft.settings.whatsappNumber || ''} onChange={(event) => patch(['settings', 'whatsappNumber'], event.target.value)} /></label>
            <label className="field"><span>Email soporte</span><input value={draft.settings.supportEmail || ''} onChange={(event) => patch(['settings', 'supportEmail'], event.target.value)} /></label>
            <label className="field wide"><span>Formas de pago</span><input value={draft.settings.paymentMethodsText ?? listToCsv(draft.settings.paymentMethods)} onChange={(event) => patch(['settings', 'paymentMethodsText'], event.target.value)} /></label>
            <label className="field wide"><span>Tipos de entrega</span><input value={draft.settings.fulfillmentTypesText ?? listToCsv(draft.settings.fulfillmentTypes)} onChange={(event) => patch(['settings', 'fulfillmentTypesText'], event.target.value)} /></label>
            {showOrderSources ? <label className="field wide"><span>Origenes de pedido</span><input value={draft.settings.orderSourcesText ?? listToCsv(draft.settings.orderSources)} onChange={(event) => patch(['settings', 'orderSourcesText'], event.target.value)} /></label> : null}
            {isPlatformMode ? <div className="field wide">
              <span>Modulos activos</span>
              <div className="module-toggle-grid">
                {MODULES.filter((module) => module.id !== 'plataforma').map((module) => {
                  const locked = ['inicio', 'negocio', 'usuarios'].includes(module.id);
                  return (
                    <label key={module.id} className={locked ? 'module-toggle locked' : 'module-toggle'}>
                      <input
                        type="checkbox"
                        checked={activeModules[module.id] !== false}
                        disabled={locked}
                        onChange={() => toggleModule(module.id)}
                      />
                      <span>{labelModuleForBusiness(module, selectedBusinessType)}</span>
                    </label>
                  );
                })}
              </div>
              <small className="muted-line">Recetas es opcional para gastronomia; Cobranza habilita apartados, saldos y abonos.</small>
            </div> : null}
          </div>
        </>
      )}
    </section>
  );
}
