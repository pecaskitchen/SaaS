import React, { useState } from 'react';
import { ArrowRight, BarChart3, Building2, CheckCircle2, LockKeyhole, Mail, Menu, MessageCircle, PackageCheck, Phone, ShieldCheck, Store, Users, WalletCards, X } from 'lucide-react';
import './styles.css';

const DEFAULT_CONFIG = {
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
    { label: 'Terminos', href: '#terminos', icon: 'shield' },
  ],
  hero: {
    eyebrow: 'Software para negocios locales',
    title: 'Tienda, CRM, inventario y pagos para negocios locales.',
    text: 'Omdexa es un sistema modular: negocios que venden en linea usan la operacion completa (tienda, caja, inventario por recetas y pagos), y negocios que solo necesitan seguimiento pueden usar solo el CRM. Tu eliges que activar.',
    imageUrl: '/omdexa-dashboard.svg',
    imageAlt: 'Panel operativo de Omdexa con pedidos, CRM, inventario y pagos',
    primaryActionLabel: 'Entrar a mi negocio',
    secondaryActionLabel: 'Ver todos los modulos',
    proofLabel: 'Hecho para operacion real',
    proofItems: ['CRM y seguimiento de clientes', 'Pedidos por tienda, caja y chat', 'Control de inventario en tiempo real'],
  },
  contact: {
    title: 'Hablemos de tu operacion',
    text: 'Agenda soporte, onboarding o una demo para configurar Omdexa alrededor de tu negocio, completo o solo el CRM.',
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
    loginTitle: 'Iniciar sesion',
    loginText: 'Usa el nombre corto de tu negocio, email y contrasena. Si eres admin de Omdexa puedes dejar negocio vacio.',
    loginBusinessPlaceholder: 'pecas o pecas.mx',
    loginEmailPlaceholder: 'tu@negocio.com',
    loginPasswordPlaceholder: 'Contrasena',
    loginButton: 'Entrar con mi cuenta',
    loginLoadingStatus: 'Validando acceso...',
  },
  sales: {
    eyebrow: 'Por que Omdexa',
    title: 'Menos hojas sueltas, menos retrabajo, mas control.',
    text: 'Omdexa junta venta, operacion y seguimiento para que cada pedido deje rastro: quien compro, cuanto pago, que inventario uso y que hay que atender despues.',
    metrics: [
      { value: '1', label: 'catalogo por cliente, sin codigo duplicado' },
      { value: '24/7', label: 'tienda abierta con reglas de horario' },
      { value: '100%', label: 'pedidos conectados a CRM y stock' },
    ],
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

function mergeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    hero: {
      ...DEFAULT_CONFIG.hero,
      ...(config?.hero || {}),
      proofItems: Array.isArray(config?.hero?.proofItems) ? config.hero.proofItems : DEFAULT_CONFIG.hero.proofItems,
    },
    contact: { ...DEFAULT_CONFIG.contact, ...(config?.contact || {}) },
    access: { ...DEFAULT_CONFIG.access, ...(config?.access || {}) },
    sales: {
      ...DEFAULT_CONFIG.sales,
      ...(config?.sales || {}),
      metrics: Array.isArray(config?.sales?.metrics) ? config.sales.metrics : DEFAULT_CONFIG.sales.metrics,
    },
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

function iconFor(name, size = 18) {
  const key = String(name || '').toLowerCase();
  if (key === 'shield') return <ShieldCheck size={size} />;
  if (key === 'chart') return <BarChart3 size={size} />;
  if (key === 'building') return <Building2 size={size} />;
  if (key === 'package') return <PackageCheck size={size} />;
  if (key === 'wallet') return <WalletCards size={size} />;
  if (key === 'phone') return <Phone size={size} />;
  if (key === 'users') return <Users size={size} />;
  if (key === 'chat') return <MessageCircle size={size} />;
  return <Store size={size} />;
}

export default function OmdexaLanding() {
  const [lookup, setLookup] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginBusiness, setLoginBusiness] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

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

  const portalLogin = async (event) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginStatus('Escribe tu email y contrasena.');
      return;
    }
    setLoginLoading(true);
    setLoginStatus(config.access.loginLoadingStatus || 'Validando acceso...');
    try {
      const response = await fetch('/api/portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: cleanLookup(loginBusiness || lookup),
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'No se pudo iniciar sesion.');
      window.location.href = data.redirectUrl;
    } catch (error) {
      setLoginStatus(error.message || 'No se pudo iniciar sesion.');
      setLoginLoading(false);
    }
  };

  const whatsappHref = `https://wa.me/${String(config.contact.whatsapp || config.contact.phone).replace(/\D/g, '')}`;

  return (
    <main className="odx-page">
      <header className="odx-nav">
        <a className="odx-logo" href="/">
          <img src="/omdexa-mark.png" alt="" className="odx-logo-icon" />
          <img src="/omdexa-wordmark.png" alt={config.brandName} className="odx-logo-word" />
        </a>

        <nav className={`odx-nav-links ${menuOpen ? 'open' : ''}`}>
          {config.nav.map((item, index) => (
            <a href={item.href || '#'} key={`${item.label}-${index}`} onClick={() => setMenuOpen(false)}>
              {item.label}
            </a>
          ))}
          <a className="odx-nav-cta" href="#access" onClick={() => setMenuOpen(false)}>{config.platformLinkLabel}</a>
        </nav>

        <button type="button" className="odx-nav-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menu">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <section className="odx-hero" id="platform">
        <div className="odx-hero-copy">
          <span className="odx-eyebrow"><ShieldCheck size={14} /> {config.hero.eyebrow}</span>
          <h1>{config.hero.title}</h1>
          <p>{config.hero.text}</p>
          <div className="odx-hero-actions">
            <a className="odx-btn odx-btn-primary" href="#access">{config.hero.primaryActionLabel} <ArrowRight size={17} /></a>
            <a className="odx-btn odx-btn-ghost" href="#ops">{config.hero.secondaryActionLabel}</a>
          </div>
          <div className="odx-hero-contact">
            <a href={`mailto:${config.contact.email}`}><Mail size={15} /> {config.contact.emailLabel}</a>
            <a href={whatsappHref}><Phone size={15} /> {config.contact.phoneLabel}</a>
          </div>
        </div>

        <div className="odx-hero-visual">
          <div className="odx-visual-frame">
            {config.hero.imageUrl ? <img src={config.hero.imageUrl} alt={config.hero.imageAlt || ''} /> : null}
          </div>
          <div className="odx-proof-card">
            <span>{config.hero.proofLabel}</span>
            <ul>
              {config.hero.proofItems.map((item, index) => (
                <li key={`${item}-${index}`}><CheckCircle2 size={16} /> {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="odx-sales" aria-label="Por que elegir Omdexa">
        <div className="odx-sales-copy">
          <span className="odx-eyebrow"><CheckCircle2 size={14} /> {config.sales.eyebrow}</span>
          <h2>{config.sales.title}</h2>
          <p>{config.sales.text}</p>
        </div>
        <div className="odx-sales-metrics">
          {config.sales.metrics.map((metric, index) => (
            <article key={`${metric.value}-${index}`}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="odx-modules" id="ops">
        <div className="odx-section-head">
          <span className="odx-eyebrow">Modulos</span>
          <h2>Todo lo que opera tu negocio, en un solo lugar.</h2>
        </div>
        <div className="odx-modules-grid">
          {config.modules.map((module, index) => (
            <article key={`${module.title}-${index}`} className="odx-module-card">
              <span className="odx-module-icon">{iconFor(module.icon, 22)}</span>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="odx-flow-band">
        <div className="odx-flow-head">
          <span className="odx-eyebrow odx-eyebrow-light"><BarChart3 size={14} /> {config.live.title}</span>
          <b className="odx-live-badge">{config.live.badge}</b>
        </div>
        <div className="odx-flow-grid">
          {config.live.signals.map((signal, index) => (
            <article key={`${signal.title}-${index}`} className="odx-flow-signal">
              <CheckCircle2 size={18} />
              <div><strong>{signal.title}</strong><span>{signal.text}</span></div>
            </article>
          ))}
        </div>
        <div className="odx-flow-steps">
          {config.live.flow.map((step, index) => (
            <React.Fragment key={`${step}-${index}`}>
              {index > 0 ? <ArrowRight size={16} /> : null}
              <span>{step}</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="odx-access" id="access">
        <div className="odx-access-card">
          <span className="odx-eyebrow"><LockKeyhole size={14} /> {config.access.eyebrow}</span>
          <h2>{config.access.title}</h2>
          <p>{config.access.text}</p>

          <div className="odx-access-grid">
            <form onSubmit={(event) => { event.preventDefault(); resolveTenant('store'); }}>
              <h3>Buscar ambiente</h3>
              <label>
                <span>{config.access.inputLabel}</span>
                <input
                  value={lookup}
                  onChange={(event) => {
                    setLookup(event.target.value);
                    if (!loginBusiness) setLoginBusiness(event.target.value);
                  }}
                  placeholder={config.access.inputPlaceholder}
                  autoComplete="organization"
                />
              </label>
              <div className="odx-access-actions">
                <button type="submit" className="odx-btn odx-btn-primary" disabled={loading}>{config.access.storeButton}</button>
                <button type="button" className="odx-btn odx-btn-ghost" onClick={() => resolveTenant('admin')} disabled={loading}>{config.access.adminButton}</button>
              </div>
              {status ? <p className="odx-access-status">{status}</p> : null}
            </form>

            <form className="odx-login-form" onSubmit={portalLogin}>
              <h3>{config.access.loginTitle}</h3>
              <p>{config.access.loginText}</p>
              <label>
                <span>Negocio</span>
                <input
                  value={loginBusiness}
                  onChange={(event) => setLoginBusiness(event.target.value)}
                  placeholder={config.access.loginBusinessPlaceholder}
                  autoComplete="organization"
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={config.access.loginEmailPlaceholder}
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <label>
                <span>Contrasena</span>
                <input
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder={config.access.loginPasswordPlaceholder}
                  autoComplete="current-password"
                  type="password"
                />
              </label>
              <button type="submit" className="odx-btn odx-btn-primary" disabled={loginLoading}>{config.access.loginButton}</button>
              <small>
                Al entrar aceptas los <a href="#terminos">Terminos</a> y el <a href="#privacidad">Aviso de privacidad</a>.
              </small>
              {loginStatus ? <p className="odx-access-status">{loginStatus}</p> : null}
            </form>
          </div>
        </div>
      </section>

      <footer className="odx-footer" id="contact">
        <div className="odx-footer-top">
          <div>
            <span className="odx-eyebrow odx-eyebrow-light">{config.contact.title}</span>
            <p>{config.contact.text}</p>
          </div>
          <div className="odx-footer-actions">
            <a href={whatsappHref}><Phone size={17} /> {config.contact.phoneLabel}</a>
            <a href={`mailto:${config.contact.email}`}><Mail size={17} /> {config.contact.emailLabel}</a>
          </div>
        </div>
        <div className="odx-footer-bottom">
          <span>&copy; {new Date().getFullYear()} {config.brandName}. Todos los derechos reservados.</span>
          <div className="odx-footer-legal">
            <a href="#access">Iniciar sesion</a>
            <a href="#privacidad">Aviso de privacidad</a>
            <a href="#terminos">Terminos de servicio</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
