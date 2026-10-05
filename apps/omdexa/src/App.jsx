import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider } from './auth/AuthContext.jsx';
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx';

// De vuelta a lazy: el import estatico metia todo el landing de Omdexa al
// chunk principal que descargan los clientes de los tenants (194->208 kB)
// aunque nunca lo vean. La carga inestable del landing que motivo el import
// estatico ya se resuelve de raiz con public/_headers (HTML sin cache) y el
// handler de vite:preloadError en main.jsx.
const OmdexaLanding = lazy(() => import('./OmdexaLanding.jsx'));
const PublicStorefront = lazy(() => import('./PublicStorefront.jsx'));
const PlatformAdmin = lazy(() => import('./platform/PlatformAdmin.jsx'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./TermsOfService.jsx'));
const Login = lazy(() => import('./Login.jsx'));
const BackofficeShell = lazy(() => import('./internal/BackofficeShell.jsx'));
const PecasClub = lazy(() => import('./club/PecasClub.jsx'));

function currentRoute() {
  try {
    if (window.location.hash) return window.location.hash;
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin' || path === '/super') return '#panel/menu';
    if (path === '/orders') return '#panel/pedidos';
    if (path === '/crm') return '#panel/clientes';
    if (path === '/stock') return '#panel/inventario';
    if (path === '/cashier') return '#panel/caja';
    if (path === '/platform') return '#platform';
    if (path === '/privacidad') return '#privacidad';
    if (path === '/terminos') return '#terminos';
    if (path === '/club' || path.startsWith('/club/')) return `#club${path.slice('/club'.length)}`;
    return '#';
  } catch {
    return '#';
  }
}

function LegacyRedirect({ route }) {
  useEffect(() => {
    const targets = {
      '#admin': '#panel/menu',
      '#super': '#panel/menu',
      '#orders': '#panel/pedidos',
      '#crm': '#panel/clientes',
      '#stock': '#panel/inventario',
      '#cashier': '#panel/caja',
    };
    window.location.hash = targets[route] || '#panel';
  }, [route]);
  return <main className="load-state"><div className="load-state-card"><p>Abriendo el panel nuevo...</p></div></main>;
}

function isOmdexaLandingHost() {
  try {
    const host = window.location.hostname.toLowerCase();
    return host === 'omdexa.com' || host === 'www.omdexa.com' || host.endsWith('.pages.dev');
  } catch {
    return false;
  }
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const syncRoute = () => setRoute(currentRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  return (
    <AuthProvider>
      <RouteErrorBoundary>
      <Suspense fallback={<main className="load-state" aria-label="Cargando"><div className="load-state-card"><span className="load-spinner" /><p>Cargando...</p></div></main>}>
        {route === '#login' ? <Login />
          : route.startsWith('#club') ? <PecasClub />
          : route.startsWith('#panel') ? <BackofficeShell />
          : route === '#platform' ? <PlatformAdmin />
          : route === '#privacidad' ? <PrivacyPolicy />
          : route === '#terminos' ? <TermsOfService />
          : ['#admin', '#super', '#orders', '#crm', '#stock', '#cashier'].includes(route) ? <LegacyRedirect route={route} />
          : isOmdexaLandingHost() ? <OmdexaLanding />
          : <PublicStorefront />}
      </Suspense>
      </RouteErrorBoundary>
    </AuthProvider>
  );
}
