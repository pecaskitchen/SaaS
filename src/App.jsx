import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider } from './auth/AuthContext.jsx';

// De vuelta a lazy: el import estatico metia todo el landing de Omdexa al
// chunk principal que descargan los clientes de los tenants (194->208 kB)
// aunque nunca lo vean. La carga inestable del landing que motivo el import
// estatico ya se resuelve de raiz con public/_headers (HTML sin cache) y el
// handler de vite:preloadError en main.jsx.
const OmdexaLanding = lazy(() => import('./OmdexaLanding.jsx'));
const PublicApp = lazy(() => import('./PublicApp.jsx'));
const LegacyApp = lazy(() => import('./LegacyApp.jsx'));
const PlatformAdmin = lazy(() => import('./platform/PlatformAdmin.jsx'));
const AdminRoute = lazy(() => import('./internal/AdminRoute.jsx'));
const OrdersPanel = lazy(() => import('./internal/OrdersPanel.jsx'));
const StockPanel = lazy(() => import('./internal/StockPanel.jsx'));
const CrmPanel = lazy(() => import('./internal/CrmPanel.jsx'));
const PrivacyPolicy = lazy(() => import('./PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./TermsOfService.jsx'));
const Login = lazy(() => import('./Login.jsx'));
const BackofficeShell = lazy(() => import('./internal/BackofficeShell.jsx'));

function currentRoute() {
  try {
    if (window.location.hash) return window.location.hash;
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return '#admin';
    if (path === '/super') return '#super';
    if (path === '/orders') return '#orders';
    if (path === '/crm') return '#crm';
    if (path === '/stock') return '#stock';
    if (path === '/cashier') return '#cashier';
    if (path === '/platform') return '#platform';
    return '#';
  } catch {
    return '#';
  }
}

function isLegacyRoute(route) {
  return ['#super', '#cashier'].includes(route);
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
      <Suspense fallback={<main className="app-loading" aria-label="Cargando" />}>
        {route === '#login' ? <Login />
          : route.startsWith('#panel') ? <BackofficeShell />
          : route === '#platform' ? <PlatformAdmin />
          : route === '#admin' ? <AdminRoute />
          : route === '#orders' ? <OrdersPanel />
          : route === '#crm' ? <CrmPanel />
          : route === '#stock' ? <StockPanel />
          : route === '#privacidad' ? <PrivacyPolicy />
          : route === '#terminos' ? <TermsOfService />
          : isLegacyRoute(route) ? <LegacyApp />
          : isOmdexaLandingHost() ? <OmdexaLanding />
          : <PublicApp />}
      </Suspense>
    </AuthProvider>
  );
}
