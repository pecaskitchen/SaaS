import React, { useEffect, useState } from 'react';

const PublicApp = React.lazy(() => import('./PublicApp.jsx'));
const PerfumeStore = React.lazy(() => import('./perfume/PerfumeStore.jsx'));

function publicApiPath(path) {
  try {
    const tenantId = new URLSearchParams(window.location.search).get('tenant_id');
    return tenantId ? `${path}?tenant_id=${encodeURIComponent(tenantId)}` : path;
  } catch {
    return path;
  }
}

export default function PublicStorefront() {
  const [state, setState] = useState({ loading: true, payload: null });

  useEffect(() => {
    let alive = true;
    fetch(publicApiPath('/api/menu'))
      .then((response) => response.json())
      .then((payload) => { if (alive) setState({ loading: false, payload }); })
      .catch(() => { if (alive) setState({ loading: false, payload: null }); });
    return () => { alive = false; };
  }, []);

  if (state.loading) return <main className="app-loading" aria-label="Cargando tienda" />;
  if (state.payload?.tenant?.settings?.storefrontTemplate === 'perfume') {
    return <PerfumeStore initialPayload={state.payload} />;
  }
  return <PublicApp />;
}
