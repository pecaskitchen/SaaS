import React, { useState } from 'react';
import { ArrowRight, BarChart3, Building2, CheckCircle2, LockKeyhole, PackageCheck, ShieldCheck, Store, WalletCards } from 'lucide-react';
import './styles.css';

const DEFAULT_CONFIG = {
  brandName: 'Omdexa',
  pageTitle: 'Omdexa | Sistema operativo para pequenos negocios',
  metaDescription: 'Omdexa centraliza tienda en linea, caja, pedidos, inventario y pagos para pequenos negocios con soporte mensual.',
  platformLinkLabel: 'Admin SaaS',
  topbarLabel: 'Portal de clientes',
  topbarStatus: 'Multi-tenant activo',
  nav: [
    { label: 'Acceso', href: '#access', icon: 'store' },
    { label: 'Plataforma', href: '#platform', icon: 'shield' },
    { label: 'Operacion', href: '#ops', icon: 'chart' },
  ],
  hero: {
    eyebrow: 'Software operativo para negocios locales',
    title: 'Tu tienda, caja, inventario y pagos en un solo sistema.',
    text: 'Omdexa ayuda a pequenos negocios a vender en linea, tomar pedidos por caja, controlar stock por recetas y operar con soporte mensual sin construir tecnologia desde cero.',
    primaryActionLabel: 'Entrar a mi negocio',
    secondaryActionLabel: 'Conocer modulos',
    proofLabel: 'Hecho para operacion real',
    proofItems: ['Pedidos por tienda y caja', 'Inventario por sucursal', 'Pagos conectados por cliente'],
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

function mergeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    hero: {
      ...DEFAULT_CONFIG.hero,
      ...(config?.hero || {}),
      proofItems: Array.isArray(config?.hero?.proofItems) ? config.hero.proofItems : DEFAULT_CONFIG.hero.proofItems,
    },
    access: { ...DEFAULT_CONFIG.access, ...(config?.access || {}) },
    live: {
      ...DEFAULT_CONFIG.live,
      ...(config?.live || {}),
      signals: Array.isArray(config?.live?.signals) ? config.live.signals : DEFAULT_CONFIG.live.signals,
      flow: Array.isArray(config?.live?.flow) ? config.live.flow : DEFAULT_CONFIG.live.flow,
    },
    nav: Array.isArray(config?.nav) ? config.nav : DEFAULT_CONFIG.nav,
    modules: Array.isArray(config?.modules) ? config.modules : DEFAULT_CONFIG.modules,
  };
}

function cleanLookup(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function iconFor(name) {
  const key = String(name || '').toLowerCase();
  if (key === 'shield') return <ShieldCheck size={18} />;
  if (key === 'chart') return <BarChart3 size={18} />;
  if (key === 'building') return <Building2 size={22} />;
  if (key === 'package') return <PackageCheck size={22} />;
  if (key === 'wallet') return <WalletCards size={22} />;
  return <Store size={18} />;
}

export default function OmdexaLanding() {
  const [lookup, setLookup] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/omdexa-config', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (alive && data?.ok) setConfig(mergeConfig(data.config));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    document.title = config.pageTitle || config.brandName || 'Omdexa';
    const description = document.querySelector('meta[name="description"]');
    if (description && config.metaDescription) description.setAttribute('content', config.metaDescription);
  }, [config.pageTitle, config.brandName, config.metaDescription]);

  const resolveTenant = async (destination = 'store') => {
    const q = cleanLookup(lookup);
    if (!q) {
      setStatus(config.access.emptyStatus);
      return;
    }
    setLoading(true);
    setStatus(config.access.searchingStatus);
    try {
      const response = await fetch(`/api/tenant-resolve?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'No encontre ese negocio.');
      window.location.href = destination === 'admin' ? data.adminUrl : data.url;
    } catch (error) {
      setStatus(error.message || 'No se pudo abrir el ambiente.');
      setLoading(false);
    }
  };

  return (
    <main className="omdexa-page">
      <section className="omdexa-shell">
        <aside className="omdexa-rail">
          <a className="omdexa-mark" href="/">
            <span>O</span>
            <strong>{config.brandName}</strong>
          </a>
          <nav>
            {config.nav.map((item, index) => (
              <a href={item.href || '#'} className={index === 0 ? 'active' : ''} key={`${item.label}-${index}`}>
                {iconFor(item.icon)} {item.label}
              </a>
            ))}
          </nav>
          <a className="omdexa-platform-link" href="#platform">{config.platformLinkLabel}</a>
        </aside>

        <section className="omdexa-workspace">
          <div className="omdexa-topbar">
            <span>{config.topbarLabel}</span>
            <b>{config.topbarStatus}</b>
          </div>

          <section className="omdexa-sales-hero" id="platform">
            <div>
              <span className="omdexa-eyebrow">{config.hero.eyebrow}</span>
              <h1>{config.hero.title}</h1>
              <p>{config.hero.text}</p>
              <div className="omdexa-hero-actions">
                <a className="primary" href="#access">{config.hero.primaryActionLabel}</a>
                <a className="secondary" href="#ops">{config.hero.secondaryActionLabel}</a>
              </div>
            </div>
            <aside className="omdexa-proof-card" aria-label={config.hero.proofLabel}>
              <span>{config.hero.proofLabel}</span>
              <ul>
                {config.hero.proofItems.map((item, index) => (
                  <li key={`${item}-${index}`}><CheckCircle2 size={17} /> {item}</li>
                ))}
              </ul>
            </aside>
          </section>

          <div className="omdexa-portal-grid">
            <section className="omdexa-access-panel" id="access">
              <span className="omdexa-eyebrow"><LockKeyhole size={16} /> {config.access.eyebrow}</span>
              <h1>{config.access.title}</h1>
              <p>{config.access.text}</p>

              <form className="omdexa-access-card" onSubmit={(event) => { event.preventDefault(); resolveTenant('store'); }}>
                <label>
                  <span>{config.access.inputLabel}</span>
                  <input
                    value={lookup}
                    onChange={(event) => setLookup(event.target.value)}
                    placeholder={config.access.inputPlaceholder}
                    autoComplete="organization"
                  />
                </label>
                <div className="omdexa-access-actions">
                  <button type="submit" className="primary" disabled={loading}>{config.access.storeButton}</button>
                  <button type="button" className="ghost" onClick={() => resolveTenant('admin')} disabled={loading}>{config.access.adminButton}</button>
                </div>
                {status ? <p className="omdexa-status">{status}</p> : null}
              </form>
            </section>

            <section className="omdexa-live-card" aria-label="Resumen operativo">
              <div className="omdexa-live-head">
                <span>{config.live.title}</span>
                <b>{config.live.badge}</b>
              </div>
              <div className="omdexa-signal-list">
                {config.live.signals.map((signal, index) => (
                  <article key={`${signal.title}-${index}`}><CheckCircle2 size={18} /><div><strong>{signal.title}</strong><span>{signal.text}</span></div></article>
                ))}
              </div>
              <div className="omdexa-flow">
                {config.live.flow.map((step, index) => (
                  <React.Fragment key={`${step}-${index}`}>
                    {index > 0 ? <ArrowRight size={16} /> : null}
                    <span>{step}</span>
                  </React.Fragment>
                ))}
              </div>
            </section>
          </div>

          <section className="omdexa-modules" id="ops">
            {config.modules.map((module, index) => (
              <article key={`${module.title}-${index}`}>{iconFor(module.icon)}<h3>{module.title}</h3><p>{module.text}</p></article>
            ))}
          </section>
        </section>
      </section>
    </main>
  );
}
