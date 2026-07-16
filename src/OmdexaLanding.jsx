import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Globe2,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Menu,
  MessageCircle,
  PackageCheck,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import './styles.css';
import './omdexa-landing.css';

const DEFAULT_CONFIG = {
  brandName: 'Omdexa',
  pageTitle: 'Omdexa | Software implementado para la operación de tu negocio',
  metaDescription: 'Omdexa conecta ventas, clientes, pedidos, inventario, caja, reportes y página web. Nuestro equipo implementa la plataforma según la operación de cada negocio.',
  platformLinkLabel: 'Iniciar sesión',
  nav: [
    { label: 'Solución', href: '#solucion' },
    { label: 'Funcionalidades', href: '#funcionalidades' },
    { label: 'Implementación', href: '#implementacion' },
    { label: 'Para quién es', href: '#sectores' },
    { label: 'Contacto', href: '#contact' },
  ],
  hero: {
    eyebrow: 'Software con implementación personalizada',
    title: 'Todo tu negocio. Una sola plataforma',
    text: 'Omdexa conecta ventas, clientes, pedidos, inventario, caja, reportes y tu página web. No te entregamos un sistema vacío: lo configuramos contigo para que responda a la forma en que realmente opera tu negocio.',
    imageUrl: '/omdexa-dashboard.svg',
    imageAlt: 'Dashboard de Omdexa con ventas, pedidos, clientes e inventario',
    primaryActionLabel: 'Solicitar diagnóstico',
    secondaryActionLabel: 'Ver funcionalidades',
    proofItems: [
      'Implementación guiada',
      'Configuración según tu operación',
      'Capacitación para tu equipo',
    ],
  },
  contact: {
    title: 'Conoce cómo Omdexa se adapta a tu negocio',
    text: 'Agenda un diagnóstico inicial. Revisamos tu operación, definimos los módulos necesarios y preparamos una propuesta de implementación.',
    phone: '+528113927548',
    whatsapp: '+528113927548',
    email: 'hola@omdexa.com',
    phoneLabel: '+52 811 392 7548',
    emailLabel: 'hola@omdexa.com',
  },
  access: {
    eyebrow: 'Portal de clientes',
    title: 'Entra al ambiente de tu negocio',
    text: 'Cada negocio opera en un ambiente independiente, con su propia información, configuración y usuarios.',
    inputLabel: 'Negocio',
    inputPlaceholder: 'pecas, pecas.mx, mi-negocio...',
    storeButton: 'Abrir tienda',
    adminButton: 'Entrar al panel',
    emptyStatus: 'Escribe el nombre o dominio de tu negocio.',
    searchingStatus: 'Buscando ambiente...',
    loginTitle: 'Iniciar sesión',
    loginText: 'Ingresa con el nombre de tu negocio, correo electrónico y contraseña.',
    loginBusinessPlaceholder: 'Nombre o dominio',
    loginEmailPlaceholder: 'tu@negocio.com',
    loginPasswordPlaceholder: 'Contraseña',
    loginButton: 'Entrar a Omdexa',
    loginLoadingStatus: 'Validando acceso...',
  },
  modules: [
    { icon: 'orders', title: 'Pedidos', text: 'Recibe, organiza y da seguimiento a cada pedido desde una sola vista.' },
    { icon: 'users', title: 'Clientes y CRM', text: 'Consulta historial, notas, etiquetas y conversaciones para dar un mejor seguimiento.' },
    { icon: 'package', title: 'Inventario', text: 'Controla existencias, movimientos, compras y consumos relacionados con tus ventas.' },
    { icon: 'wallet', title: 'Caja y pagos', text: 'Registra cobros, métodos de pago, ingresos y cortes con mayor trazabilidad.' },
    { icon: 'chart', title: 'Reportes', text: 'Entiende ventas, productos, clientes y tendencias sin depender de hojas manuales.' },
    { icon: 'store', title: 'Página web', text: 'Publica tu catálogo y permite que tus clientes consulten o compren en línea.' },
  ],
};

const PROBLEMS = [
  'Pedidos repartidos entre chats',
  'Inventario en hojas separadas',
  'Clientes sin seguimiento',
  'Reportes hechos a mano',
];

const BENEFITS = [
  'Una sola fuente de información',
  'Procesos conectados',
  'Historial completo',
  'Datos listos para decidir',
];

const IMPLEMENTATION_STEPS = [
  {
    icon: ClipboardCheck,
    title: 'Diagnóstico',
    text: 'Entendemos cómo vendes, cobras, compras y operas actualmente.',
  },
  {
    icon: Building2,
    title: 'Configuración',
    text: 'Preparamos módulos, productos, sucursales, usuarios, permisos y reglas.',
  },
  {
    icon: GraduationCap,
    title: 'Pruebas y capacitación',
    text: 'Validamos los procesos y enseñamos a tu equipo a trabajar en Omdexa.',
  },
  {
    icon: Rocket,
    title: 'Arranque acompañado',
    text: 'Te acompañamos durante la puesta en marcha para resolver ajustes iniciales.',
  },
];

const IMPLEMENTATION_INCLUDES = [
  'Configuración de los módulos contratados',
  'Carga inicial de información acordada',
  'Creación de usuarios y permisos',
  'Pruebas de los procesos principales',
  'Capacitación para el equipo',
  'Acompañamiento durante el arranque',
];

const SECTORS = [
  'Restaurantes',
  'Tiendas y boutiques',
  'Repostería',
  'Distribuidores',
  'Negocios de reventa',
  'Servicios locales',
];

function mergeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    hero: {
      ...DEFAULT_CONFIG.hero,
      ...(config?.hero || {}),
      proofItems: Array.isArray(config?.hero?.proofItems)
        ? config.hero.proofItems
        : DEFAULT_CONFIG.hero.proofItems,
    },
    contact: { ...DEFAULT_CONFIG.contact, ...(config?.contact || {}) },
    access: { ...DEFAULT_CONFIG.access, ...(config?.access || {}) },
    nav: Array.isArray(config?.nav) ? config.nav : DEFAULT_CONFIG.nav,
    modules: Array.isArray(config?.modules) ? config.modules : DEFAULT_CONFIG.modules,
  };
}

function cleanLookup(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function removeEndingPeriod(value) {
  return String(value || '').trim().replace(/[.。]+$/, '');
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
      .then((data) => {
        if (alive && data?.ok) setConfig(mergeConfig(data.config));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    document.title = config.pageTitle || config.brandName || 'Omdexa';
    const description = document.querySelector('meta[name="description"]');
    if (description && config.metaDescription) {
      description.setAttribute('content', config.metaDescription);
    }
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
      const response = await fetch(`/api/tenant-resolve?q=${encodeURIComponent(q)}`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'No encontré ese negocio.');
      }
      window.location.href = destination === 'admin' ? data.adminUrl : data.url;
    } catch (error) {
      setStatus(error.message || 'No se pudo abrir el ambiente.');
      setLoading(false);
    }
  };

  const portalLogin = async (event) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginStatus('Escribe tu correo electrónico y contraseña.');
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
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'No se pudo iniciar sesión.');
      }
      window.location.href = data.redirectUrl;
    } catch (error) {
      setLoginStatus(error.message || 'No se pudo iniciar sesión.');
      setLoginLoading(false);
    }
  };

  const whatsappMessage = 'Hola, me interesa conocer Omdexa y solicitar un diagnóstico para mi negocio.';
  const whatsappHref = `https://wa.me/${String(config.contact.whatsapp || config.contact.phone).replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <main className="odx-page odx-v2">
      <header className="odx-nav">
        <a className="odx-logo" href="/">
          <img src="/omdexa-mark.png" alt="" className="odx-logo-icon" />
          <img src="/omdexa-wordmark.png" alt={config.brandName} className="odx-logo-word" />
        </a>

        <nav className={`odx-nav-links ${menuOpen ? 'open' : ''}`}>
          {config.nav.map((item, index) => (
            <a
              href={item.href || '#'}
              key={`${item.label}-${index}`}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a className="odx-nav-cta" href="#access" onClick={() => setMenuOpen(false)}>
            {config.platformLinkLabel}
          </a>
        </nav>

        <button
          type="button"
          className="odx-nav-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Abrir menú"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <section className="odx-hero" id="solucion">
        <div className="odx-hero-copy">
          <span className="odx-eyebrow">
            <Sparkles size={14} /> {config.hero.eyebrow}
          </span>
          <h1>{removeEndingPeriod(config.hero.title)}</h1>
          <p>{config.hero.text}</p>

          <div className="odx-hero-actions">
            <a
              className="odx-btn odx-btn-primary"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
            >
              {config.hero.primaryActionLabel} <ArrowRight size={17} />
            </a>
            <a className="odx-btn odx-btn-ghost" href="#funcionalidades">
              {config.hero.secondaryActionLabel}
            </a>
          </div>

          <div className="odx-trust-row">
            {config.hero.proofItems.map((item) => (
              <span key={item}>
                <CheckCircle2 size={15} /> {item}
              </span>
            ))}
          </div>
        </div>

        <div className="odx-hero-visual">
          <div className="odx-browser-mockup">
            <div className="odx-browser-bar">
              <i />
              <i />
              <i />
              <span>app.omdexa.com</span>
            </div>
            <div className="odx-visual-frame">
              {config.hero.imageUrl ? (
                <img src={config.hero.imageUrl} alt={config.hero.imageAlt || ''} />
              ) : null}
            </div>
          </div>
          <div className="odx-floating-metric odx-floating-top">
            <Users size={18} />
            <span><b>Implementación guiada</b>Configurada para tu operación</span>
          </div>
          <div className="odx-floating-metric odx-floating-bottom">
            <BarChart3 size={18} />
            <span><b>Información conectada</b>Decisiones con datos reales</span>
          </div>
        </div>
      </section>

      <section className="odx-problem" aria-label="Problemas que resuelve Omdexa">
        <div>
          <span className="odx-eyebrow">Deja atrás el desorden</span>
          <h2>Tu negocio no debería depender de cinco herramientas separadas</h2>
          <p className="odx-section-description">
            Omdexa concentra la operación y evita que la información se pierda entre chats,
            archivos y procesos manuales.
          </p>
        </div>
        <div className="odx-compare-grid">
          <article className="odx-compare-card is-before">
            <h3>Sin Omdexa</h3>
            {PROBLEMS.map((item) => (
              <p key={item}><X size={16} /> {item}</p>
            ))}
          </article>
          <article className="odx-compare-card is-after">
            <h3>Con Omdexa</h3>
            {BENEFITS.map((item) => (
              <p key={item}><CheckCircle2 size={16} /> {item}</p>
            ))}
          </article>
        </div>
      </section>

      <section className="odx-modules" id="funcionalidades">
        <div className="odx-section-head">
          <span className="odx-eyebrow">Funcionalidades</span>
          <h2>Todo lo esencial para operar y hacer crecer tu negocio</h2>
          <p>
            Los módulos comparten información para que no tengas que capturar lo mismo varias
            veces. Puedes empezar con lo necesario y activar más funciones conforme crezca tu operación.
          </p>
        </div>
        <div className="odx-modules-grid">
          {config.modules.map((module, index) => (
            <article key={`${module.title}-${index}`} className="odx-module-card">
              <span className="odx-module-icon">{iconFor(module.icon, 22)}</span>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              <span className="odx-card-link">
                Información conectada <ArrowRight size={15} />
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="odx-connected-band">
        <div className="odx-connected-copy">
          <span className="odx-eyebrow odx-eyebrow-light">
            <Globe2 size={14} /> Todo conectado
          </span>
          <h2>De la primera visita al reporte final</h2>
          <p>
            Cada acción alimenta el siguiente proceso. El pedido actualiza al cliente, registra el
            cobro, afecta el inventario y genera información para tus reportes.
          </p>
        </div>
        <div className="odx-connected-flow">
          {['Página web', 'Pedido', 'Cliente', 'Pago', 'Inventario', 'Reporte'].map((step, index) => (
            <React.Fragment key={step}>
              {index > 0 ? <ArrowRight size={18} /> : null}
              <span>{step}</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="odx-implementation" id="implementacion">
        <div className="odx-implementation-heading">
          <span className="odx-eyebrow">Nuestra diferencia</span>
          <h2>No te entregamos un sistema vacío. Implementamos Omdexa contigo</h2>
          <p>
            Cada negocio trabaja distinto. Antes del arranque entendemos tu operación y configuramos
            Omdexa con tus productos, procesos, usuarios, sucursales y reglas.
          </p>
        </div>

        <div className="odx-steps-grid">
          {IMPLEMENTATION_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title}>
                <span className="odx-step-number">0{index + 1}</span>
                <Icon size={25} />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            );
          })}
        </div>

        <div className="odx-implementation-detail">
          <div>
            <span className="odx-eyebrow">Puesta en marcha guiada</span>
            <h3>La implementación se cotiza según el alcance de cada negocio</h3>
            <p>
              El costo depende de los módulos, número de sucursales, usuarios, información por cargar,
              migraciones e integraciones necesarias. Así pagas por una implementación real, no por un
              paquete genérico que quizá no necesitas.
            </p>
            <a
              className="odx-btn odx-btn-primary"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
            >
              Solicitar diagnóstico <ArrowRight size={17} />
            </a>
          </div>
          <div className="odx-implementation-list">
            {IMPLEMENTATION_INCLUDES.map((item) => (
              <span key={item}><CheckCircle2 size={18} /> {item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="odx-sectors" id="sectores">
        <div className="odx-sectors-copy">
          <span className="odx-eyebrow">Una plataforma, distintos negocios</span>
          <h2>Tecnología adaptada a tu operación, no al revés</h2>
          <p>
            Omdexa es modular, pero la implementación es específica. Activamos lo que necesitas y
            configuramos productos, procesos, usuarios y reglas para tu giro.
          </p>
          <a
            className="odx-btn odx-btn-primary"
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
          >
            Quiero conocer Omdexa <ArrowRight size={17} />
          </a>
        </div>
        <div className="odx-sector-list">
          {SECTORS.map((sector) => (
            <span key={sector}><CheckCircle2 size={17} /> {sector}</span>
          ))}
        </div>
      </section>

      <section className="odx-access" id="access">
        <div className="odx-access-card">
          <div className="odx-access-intro">
            <span className="odx-eyebrow">
              <LockKeyhole size={14} /> {config.access.eyebrow}
            </span>
            <h2>{removeEndingPeriod(config.access.title)}</h2>
            <p>{config.access.text}</p>
            <ShieldCheck size={42} />
          </div>

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
                <button type="submit" className="odx-btn odx-btn-primary" disabled={loading}>
                  {config.access.storeButton}
                </button>
                <button
                  type="button"
                  className="odx-btn odx-btn-ghost"
                  onClick={() => resolveTenant('admin')}
                  disabled={loading}
                >
                  {config.access.adminButton}
                </button>
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
                <span>Correo electrónico</span>
                <input
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={config.access.loginEmailPlaceholder}
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <label>
                <span>Contraseña</span>
                <input
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder={config.access.loginPasswordPlaceholder}
                  autoComplete="current-password"
                  type="password"
                />
              </label>
              <button type="submit" className="odx-btn odx-btn-primary" disabled={loginLoading}>
                {config.access.loginButton}
              </button>
              {loginStatus ? <p className="odx-access-status">{loginStatus}</p> : null}
            </form>
          </div>
        </div>
      </section>

      <section className="odx-final-cta">
        <span className="odx-eyebrow odx-eyebrow-light">Da el siguiente paso</span>
        <h2>Más control. Más tiempo. Mejores decisiones</h2>
        <p>Cuéntanos cómo opera tu negocio y te mostraremos cómo implementar Omdexa.</p>
        <div>
          <a className="odx-btn odx-btn-light" href={whatsappHref} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> Solicitar diagnóstico
          </a>
          <a className="odx-btn odx-btn-outline-light" href={`mailto:${config.contact.email}`}>
            <Mail size={18} /> Escribir por correo
          </a>
        </div>
      </section>

      <footer className="odx-footer" id="contact">
        <div className="odx-footer-top">
          <div>
            <img src="/omdexa-wordmark.png" alt={config.brandName} className="odx-footer-logo" />
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
            <a href="#access">Iniciar sesión</a>
            <a href="#privacidad">Aviso de privacidad</a>
            <a href="#terminos">Términos de servicio</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
