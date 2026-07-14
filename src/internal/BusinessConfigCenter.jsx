import React, { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';

const THEMES = ['neutral', 'gastro', 'floral', 'boutique', 'premium'];

function csvToList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function listToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function platformToken() {
  try {
    return window.sessionStorage.getItem('platform_admin_token') || '';
  } catch {
    return '';
  }
}

async function platformFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-platform-admin-token': platformToken(),
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
    timezone: 'America/Mexico_City',
    whatsappNumber: '',
    supportEmail: '',
    paymentMethods: ['Efectivo', 'Transferencia', 'Mercado Pago'],
    fulfillmentTypes: ['Recoger', 'Entrega a domicilio'],
    orderSources: ['Tienda', 'WhatsApp', 'Facebook', 'Instagram', 'Llamada'],
  },
};

export default function BusinessConfigCenter({ tenantId }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

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
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await platformFetch(`/api/platform/config-center?tenant_id=${encodeURIComponent(tenantId)}`);
      setDraft({ ...emptyDraft, ...(data.tenant || {}), brand: { ...emptyDraft.brand, ...(data.tenant?.brand || {}) }, settings: { ...emptyDraft.settings, ...(data.tenant?.settings || {}) } });
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
      await platformFetch('/api/platform/config-center', {
        method: 'PATCH',
        body: JSON.stringify({
          ...draft,
          tenantId: draft.id || tenantId,
          settings: {
            ...draft.settings,
            paymentMethods: csvToList(draft.settings.paymentMethodsText || listToCsv(draft.settings.paymentMethods)),
            fulfillmentTypes: csvToList(draft.settings.fulfillmentTypesText || listToCsv(draft.settings.fulfillmentTypes)),
            orderSources: csvToList(draft.settings.orderSourcesText || listToCsv(draft.settings.orderSources)),
          },
        }),
      });
      setSaved('Configuracion guardada.');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, [tenantId]);

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Cliente</p>
          <h2>Centro de configuracion</h2>
        </div>
        <div className="button-row">
          <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar"><RefreshCw size={18} /></button>
          <button type="button" className="primary" onClick={save} disabled={saving}><Save size={16} /> Guardar</button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="form-success">{saved}</p> : null}

      <div className="form-grid two">
        <label className="field"><span>Nombre comercial</span><input value={draft.name} onChange={(event) => patch(['name'], event.target.value)} /></label>
        <label className="field"><span>Razon social</span><input value={draft.legalName} onChange={(event) => patch(['legalName'], event.target.value)} /></label>
        <label className="field"><span>Contacto</span><input value={draft.contactName} onChange={(event) => patch(['contactName'], event.target.value)} /></label>
        <label className="field"><span>Email</span><input value={draft.contactEmail} onChange={(event) => patch(['contactEmail'], event.target.value)} /></label>
        <label className="field"><span>Telefono</span><input value={draft.contactPhone} onChange={(event) => patch(['contactPhone'], event.target.value)} /></label>
        <label className="field"><span>Dominio</span><input value={draft.domain} onChange={(event) => patch(['domain'], event.target.value)} /></label>
      </div>

      <h3>Marca publica</h3>
      <div className="form-grid two">
        <label className="field"><span>Estilo visual</span><select value={draft.brand.themePreset} onChange={(event) => patch(['brand', 'themePreset'], event.target.value)}>{THEMES.map((theme) => <option key={theme}>{theme}</option>)}</select></label>
        <label className="field"><span>Nombre visible</span><input value={draft.brand.displayName} onChange={(event) => patch(['brand', 'displayName'], event.target.value)} /></label>
        <label className="field"><span>Tagline</span><input value={draft.brand.tagline} onChange={(event) => patch(['brand', 'tagline'], event.target.value)} /></label>
        <label className="field"><span>Logo URL</span><input value={draft.brand.logoUrl} onChange={(event) => patch(['brand', 'logoUrl'], event.target.value)} /></label>
        <label className="field"><span>Imagen hero URL</span><input value={draft.brand.heroImageUrl} onChange={(event) => patch(['brand', 'heroImageUrl'], event.target.value)} /></label>
        <label className="field"><span>Titulo hero</span><input value={draft.brand.heroTitle} onChange={(event) => patch(['brand', 'heroTitle'], event.target.value)} /></label>
        <label className="field wide"><span>Texto hero</span><textarea value={draft.brand.heroText} onChange={(event) => patch(['brand', 'heroText'], event.target.value)} /></label>
      </div>

      <h3>Operacion</h3>
      <div className="form-grid two">
        <label className="field"><span>WhatsApp principal</span><input value={draft.settings.whatsappNumber || ''} onChange={(event) => patch(['settings', 'whatsappNumber'], event.target.value)} /></label>
        <label className="field"><span>Email soporte</span><input value={draft.settings.supportEmail || ''} onChange={(event) => patch(['settings', 'supportEmail'], event.target.value)} /></label>
        <label className="field wide"><span>Formas de pago</span><input value={draft.settings.paymentMethodsText ?? listToCsv(draft.settings.paymentMethods)} onChange={(event) => patch(['settings', 'paymentMethodsText'], event.target.value)} /></label>
        <label className="field wide"><span>Tipos de entrega</span><input value={draft.settings.fulfillmentTypesText ?? listToCsv(draft.settings.fulfillmentTypes)} onChange={(event) => patch(['settings', 'fulfillmentTypesText'], event.target.value)} /></label>
        <label className="field wide"><span>Origenes de pedido</span><input value={draft.settings.orderSourcesText ?? listToCsv(draft.settings.orderSources)} onChange={(event) => patch(['settings', 'orderSourcesText'], event.target.value)} /></label>
      </div>
    </section>
  );
}
