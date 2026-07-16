import React, { useState } from 'react';
import {
  ArrowRight, BarChart3, Building2, CheckCircle2, ClipboardList, Globe2, LayoutDashboard,
  LockKeyhole, Mail, Menu, MessageCircle, PackageCheck, Phone, ShieldCheck, ShoppingBag,
  Sparkles, Store, TrendingUp, Users, WalletCards, X, Zap,
} from 'lucide-react';
import './styles.css';
import './omdexa-landing.css';

const DEFAULT_CONFIG = {
  brandName: 'Omdexa',
  pageTitle: 'Omdexa | Controla todo tu negocio desde un solo lugar',
  metaDescription: 'Omdexa conecta ventas, clientes, inventario, pedidos, caja, reportes y tu pagina web en una plataforma modular para negocios en crecimiento.',
  platformLinkLabel: 'Iniciar sesion',
  nav: [
    { label: 'Solucion', href: '#solucion' },
    { label: 'Funcionalidades', href: '#funcionalidades' },
    { label: 'Como funciona', href: '#como-funciona' },
    { label: 'Para quien es', href: '#sectores' },
    { label: 'Contacto', href: '#contact' },
  ],
  hero: {
    eyebrow: 'Plataforma modular para negocios',
    title: 'Todo tu negocio. Una sola plataforma.',
    text: 'Centraliza ventas, clientes, pedidos, inventario, caja, reportes y tu pagina web. Empieza con los modulos que necesitas y activa mas conforme crece tu operacion.',
    imageUrl: '/omdexa-dashboard.svg',
    imageAlt: 'Dashboard de Omdexa con ventas, pedidos, clientes e inventario',
    primaryActionLabel: 'Solicitar una demo',
    secondaryActionLabel: 'Ver funcionalidades',
    proofLabel: 'Diseñado para operar de verdad',
    proofItems: ['Informacion conectada entre modulos', 'Acceso por usuarios y roles', 'Configuracion independiente por negocio'],
  },
  contact: {
    title: 'Conoce como Omdexa se adapta a tu negocio',
    text: 'Agenda una demostracion y revisamos contigo los modulos, procesos y configuraciones que realmente necesitas.',
    phone: '+528113927548',
    whatsapp: '+528113927548',
    email: 'hola@omdexa.com',
    phoneLabel: '+52 811 392 7548',
    emailLabel: 'hola@omdexa.com',
  },
  access: {
    eyebrow: 'Portal de clientes',
    title: 'Entra al ambiente de tu negocio.',
    text: 'Cada negocio opera en un ambiente independiente, con su propia informacion, configuracion y usuarios.',
    inputLabel: 'Negocio',
    inputPlaceholder: 'pecas, pecas.mx, mi-negocio...',
    storeButton: 'Abrir tienda',
    adminButton: 'Entrar al panel',
    emptyStatus: 'Escribe el nombre o dominio de tu negocio.',
    searchingStatus: 'Buscando ambiente...',
    loginTitle: 'Iniciar sesion',
    loginText: 'Ingresa con el nombre de tu negocio, email y contrasena.',
    loginBusinessPlaceholder: 'Nombre o dominio',
    loginEmailPlaceholder: 'tu@negocio.com',
    loginPasswordPlaceholder: 'Contrasena',
    loginButton: 'Entrar a Omdexa',
    loginLoadingStatus: 'Validando acceso...',
  },
  modules: [
    { icon: 'orders', title: 'Pedidos', text: 'Recibe, organiza y da seguimiento a cada pedido desde una sola vista.' },
    { icon: 'users', title: 'Clientes y CRM', text: 'Consulta historial, notas, etiquetas y conversaciones para dar mejor seguimiento.' },
    { icon: 'package', title: 'Inventario', text: 'Controla existencias, movimientos, compras y consumo relacionado con tus ventas.' },
    { icon: 'wallet', title: 'Caja y pagos', text: 'Registra cobros, métodos de pago, ingresos y cortes con mayor trazabilidad.' },
    { icon: 'chart', title: 'Reportes', text: 'Entiende ventas, productos, clientes y tendencias sin depender de hojas manuales.' },
    { icon: 'store', title: 'Pagina web', text: 'Publica tu catalogo y permite que tus clientes consulten o compren en linea.' },
  ],
};

const PROBLEMS = ['Pedidos repartidos entre chats', 'Inventario en hojas separadas', 'Clientes sin seguimiento', 'Reportes hechos a mano'];
const BENEFITS = ['Una fuente de informacion', 'Procesos conectados', 'Historial completo', 'Datos listos para decidir'];
const STEPS = [
  { icon: Building2, title: 'Configura tu negocio', text: 'Define marca, sucursales, usuarios y permisos.' },
  { icon: ShoppingBag, title: 'Publica y vende', text: 'Carga productos y recibe pedidos desde tus canales.' },
  { icon: Zap, title: 'Opera en tiempo real', text: 'Conecta pedidos, pagos, clientes e inventario.' },
  { icon: TrendingUp, title: 'Mide y mejora', text: 'Consulta reportes y detecta oportunidades.' },
];
const SECTORS = ['Restaurantes', 'Tiendas y boutiques', 'Reposteria', 'Distribuidores', 'Negocios de reventa', 'Servicios locales'];

function mergeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    hero: { ...DEFAULT_CONFIG.hero, ...(config?.hero || {}), proofItems: Array.isArray(config?.hero?.proofItems) ? config.hero.proofItems : DEFAULT_CONFIG.hero.proofItems },
    contact: { ...DEFAULT_CONFIG.contact, ...(config?.contact || {}) },
    access: { ...DEFAULT_CONFIG.access, ...(config?.access || {}) },
    nav: Array.isArray(config?.nav) ? config.nav : DEFAULT_CONFIG.nav,
    modules: Array.isArray(config?.modules) ? config.modules : DEFAULT_CONFIG.modules,
  };
}

function cleanLookup(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function iconFor(name, size = 20) {
  const key = String(name || '').toLowerCase();
  if (key === 'chart') return <BarChart3 size={size} />;
  if (key === 'package') return <PackageCheck size={size} />;
  if (key === 'wallet') return <WalletCards size={size} />;
  if (key === 'users') return <Users size={size} />;
  if (key === 'orders') return <ClipboardList size={size} />;
  if (key === 'store') return <Store size={size} />;
  return <LayoutDashboard size={size} />;
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
      .then((data) => { if (alive && data?.ok) setConfig(mergeConfig(data.config)); })
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
    if (!q) { setStatus(config.access.emptyStatus); return; }
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
    if (!loginEmail.trim() || !loginPassword) { setLoginStatus('Escribe tu email y contrasena.'); return; }
    setLoginLoading(true);
    setLoginStatus(config.access.loginLoadingStatus || 'Validando acceso...');
    try {
      const response = await fetch('/api/portal-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: cleanLookup(loginBusiness || lookup), email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'No se pudo iniciar sesion.');
      window.location.href = data.redirectUrl;
    } catch (error) {
      setLoginStatus(error.message || 'No se pudo iniciar sesion.');
      setLoginLoading(false);
    }
  };

  const whatsappHref = `https://wa.me/${String(config.contact.whatsapp || config.contact.phone).replace(/\D/g, '')}?text=${encodeURIComponent('Hola, me interesa conocer Omdexa y solicitar una demo.')}`;

  return (
    <main className="odx-page odx-v2">
      <header className="odx-nav">
        <a className="odx-logo" href="/">
          <img src="/omdexa-mark.png" alt="" className="odx-logo-icon" />
          <img src="/omdexa-wordmark.png" alt={config.brandName} className="odx-logo-word" />
        </a>
        <nav className={`odx-nav-links ${menuOpen ? 'open' : ''}`}>
          {config.nav.map((item, index) => <a href={item.href || '#'} key={`${item.label}-${index}`} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
          <a className="odx-nav-cta" href="#access" onClick={() => setMenuOpen(false)}>{config.platformLinkLabel}</a>
        </nav>
        <button type="button" className="odx-nav-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menu">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </header>

      <section className="odx-hero" id="solucion">
        <div className="odx-hero-copy">
          <span className="odx-eyebrow"><Sparkles size={14} /> {config.hero.eyebrow}</span>
          <h1>{config.hero.title}</h1>
          <p>{config.hero.text}</p>
          <div className="odx-hero-actions">
            <a className="odx-btn odx-btn-primary" href={whatsappHref} target="_blank" rel="noreferrer">{config.hero.primaryActionLabel} <ArrowRight size={17} /></a>
            <a className="odx-btn odx-btn-ghost" href="#funcionalidades">{config.hero.secondaryActionLabel}</a>
          </div>
          <div className="odx-trust-row">
            {config.hero.proofItems.map((item) => <span key={item}><CheckCircle2 size={15} /> {item}</span>)}
          </div>
        </div>
        <div className="odx-hero-visual">
          <div className="odx-browser-mockup">
            <div className="odx-browser-bar"><i /><i /><i /><span>app.omdexa.com</span></div>
            <div className="odx-visual-frame">{config.hero.imageUrl ? <img src={config.hero.imageUrl} alt={config.hero.imageAlt || ''} /> : null}</div>
          </div>
          <div className="odx-floating-metric odx-floating-top"><Users size={18} /><span><b>CRM conectado</b>Historial por cliente</span></div>
          <div className="odx-floating-metric odx-floating-bottom"><BarChart3 size={18} /><span><b>Datos claros</b>Decisiones en tiempo real</span></div>
        </div>
      </section>

      <section className="odx-problem" aria-label="Problemas que resuelve Omdexa">
        <div><span className="odx-eyebrow">Deja atras el desorden</span><h2>Tu negocio no deberia depender de cinco herramientas separadas.</h2></div>
        <div className="odx-compare-grid">
          <article className="odx-compare-card is-before"><h3>Sin Omdexa</h3>{PROBLEMS.map((item) => <p key={item}><X size={16} />{item}</p>)}</article>
          <article className="odx-compare-card is-after"><h3>Con Omdexa</h3>{BENEFITS.map((item) => <p key={item}><CheckCircle2 size={16} />{item}</p>)}</article>
        </div>
      </section>

      <section className="odx-modules" id="funcionalidades">
        <div className="odx-section-head"><span className="odx-eyebrow">Funcionalidades</span><h2>Todo lo esencial para operar y hacer crecer tu negocio.</h2><p>Los modulos comparten informacion para que no tengas que capturar lo mismo varias veces.</p></div>
        <div className="odx-modules-grid">{config.modules.map((module, index) => <article key={`${module.title}-${index}`} className="odx-module-card"><span className="odx-module-icon">{iconFor(module.icon, 22)}</span><h3>{module.title}</h3><p>{module.text}</p><span className="odx-card-link">Informacion conectada <ArrowRight size={15} /></span></article>)}</div>
      </section>

      <section className="odx-connected-band">
        <div className="odx-connected-copy"><span className="odx-eyebrow odx-eyebrow-light"><Globe2 size={14} /> Todo conectado</span><h2>De la primera visita al reporte final.</h2><p>Cada accion alimenta el siguiente proceso. El pedido actualiza el cliente, registra el cobro y genera informacion para tus reportes.</p></div>
        <div className="odx-connected-flow">{['Pagina web', 'Pedido', 'Cliente', 'Pago', 'Inventario', 'Reporte'].map((step, index) => <React.Fragment key={step}>{index > 0 ? <ArrowRight size={18} /> : null}<span>{step}</span></React.Fragment>)}</div>
      </section>

      <section className="odx-process" id="como-funciona">
        <div className="odx-section-head"><span className="odx-eyebrow">Como funciona</span><h2>Empieza simple. Crece sin cambiar de sistema.</h2></div>
        <div className="odx-steps-grid">{STEPS.map((step, index) => { const Icon = step.icon; return <article key={step.title}><span className="odx-step-number">0{index + 1}</span><Icon size={25} /><h3>{step.title}</h3><p>{step.text}</p></article>; })}</div>
      </section>

      <section className="odx-sectors" id="sectores">
        <div className="odx-sectors-copy"><span className="odx-eyebrow">Una plataforma, distintos negocios</span><h2>Omdexa se adapta a tu operacion, no al reves.</h2><p>Activa solo los modulos que necesitas y configura productos, procesos, usuarios y reglas para tu giro.</p><a className="odx-btn odx-btn-primary" href={whatsappHref} target="_blank" rel="noreferrer">Quiero conocer Omdexa <ArrowRight size={17} /></a></div>
        <div className="odx-sector-list">{SECTORS.map((sector) => <span key={sector}><CheckCircle2 size={17} />{sector}</span>)}</div>
      </section>

      <section className="odx-access" id="access">
        <div className="odx-access-card">
          <div className="odx-access-intro"><span className="odx-eyebrow"><LockKeyhole size={14} /> {config.access.eyebrow}</span><h2>{config.access.title}</h2><p>{config.access.text}</p><ShieldCheck size={42} /></div>
          <div className="odx-access-grid">
            <form onSubmit={(event) => { event.preventDefault(); resolveTenant('store'); }}><h3>Buscar ambiente</h3><label><span>{config.access.inputLabel}</span><input value={lookup} onChange={(event) => { setLookup(event.target.value); if (!loginBusiness) setLoginBusiness(event.target.value); }} placeholder={config.access.inputPlaceholder} autoComplete="organization" /></label><div className="odx-access-actions"><button type="submit" className="odx-btn odx-btn-primary" disabled={loading}>{config.access.storeButton}</button><button type="button" className="odx-btn odx-btn-ghost" onClick={() => resolveTenant('admin')} disabled={loading}>{config.access.adminButton}</button></div>{status ? <p className="odx-access-status">{status}</p> : null}</form>
            <form className="odx-login-form" onSubmit={portalLogin}><h3>{config.access.loginTitle}</h3><p>{config.access.loginText}</p><label><span>Negocio</span><input value={loginBusiness} onChange={(event) => setLoginBusiness(event.target.value)} placeholder={config.access.loginBusinessPlaceholder} autoComplete="organization" /></label><label><span>Email</span><input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder={config.access.loginEmailPlaceholder} autoComplete="email" inputMode="email" /></label><label><span>Contrasena</span><input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder={config.access.loginPasswordPlaceholder} autoComplete="current-password" type="password" /></label><button type="submit" className="odx-btn odx-btn-primary" disabled={loginLoading}>{config.access.loginButton}</button>{loginStatus ? <p className="odx-access-status">{loginStatus}</p> : null}</form>
          </div>
        </div>
      </section>

      <section className="odx-final-cta"><span className="odx-eyebrow odx-eyebrow-light">Da el siguiente paso</span><h2>Mas control. Mas tiempo. Mejores decisiones.</h2><p>Descubre como centralizar la operacion de tu negocio con Omdexa.</p><div><a className="odx-btn odx-btn-light" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Solicitar demo</a><a className="odx-btn odx-btn-outline-light" href={`mailto:${config.contact.email}`}><Mail size={18} /> Escribir por correo</a></div></section>

      <footer className="odx-footer" id="contact"><div className="odx-footer-top"><div><img src="/omdexa-wordmark.png" alt={config.brandName} className="odx-footer-logo" /><p>{config.contact.text}</p></div><div className="odx-footer-actions"><a href={whatsappHref}><Phone size={17} /> {config.contact.phoneLabel}</a><a href={`mailto:${config.contact.email}`}><Mail size={17} /> {config.contact.emailLabel}</a></div></div><div className="odx-footer-bottom"><span>&copy; {new Date().getFullYear()} {config.brandName}. Todos los derechos reservados.</span><div className="odx-footer-legal"><a href="#access">Iniciar sesion</a><a href="#privacidad">Aviso de privacidad</a><a href="#terminos">Terminos de servicio</a></div></div></footer>
    </main>
  );
}
