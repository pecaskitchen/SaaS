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
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, payload: null, error: '' });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setState({ loading: true, payload: null, error: '' });
    fetch(publicApiPath('/api/menu'), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'No se pudo cargar el catálogo.');
        return payload;
      })
      .then((payload) => { if (alive) setState({ loading: false, payload, error: '' }); })
      .catch((error) => {
        if (alive) setState({ loading: false, payload: null, error: error?.name === 'AbortError' ? 'La tienda tardó demasiado en responder.' : (error?.message || 'No se pudo cargar la tienda.') });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);

  if (state.loading) return <main className="load-state" aria-label="Cargando tienda"><div className="load-state-card"><span className="load-spinner" /><p>Cargando tienda...</p></div></main>;
  if (state.error) return <main className="load-state" role="alert"><div className="load-state-card"><h1>No pudimos cargar la tienda</h1><p>{state.error}</p><button type="button" className="primary" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button></div></main>;
  if (state.payload?.tenant?.settings?.storefrontTemplate === 'perfume') {
    return <PerfumeStore initialPayload={state.payload} />;
  }
  return <PublicApp />;
}
