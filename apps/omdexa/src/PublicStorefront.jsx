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

function storefrontCacheKey() {
  try {
    const tenantId = new URLSearchParams(window.location.search).get('tenant_id') || '';
    return `omdexa_public_storefront:${window.location.hostname}:${tenantId}`;
  } catch {
    return 'omdexa_public_storefront';
  }
}

function readCachedStorefront() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(storefrontCacheKey()) || 'null');
    return cached?.payload?.ok ? cached.payload : null;
  } catch {
    return null;
  }
}

function cacheStorefront(payload) {
  try {
    window.localStorage.setItem(storefrontCacheKey(), JSON.stringify({ payload, savedAt: Date.now() }));
  } catch {
    // La tienda sigue funcionando si el navegador bloquea el almacenamiento.
  }
}

export default function PublicStorefront() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => {
    const payload = readCachedStorefront();
    return { loading: !payload, refreshing: Boolean(payload), payload, error: '' };
  });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setState((current) => current.payload
      ? { ...current, loading: false, refreshing: true, error: '' }
      : { loading: true, refreshing: false, payload: null, error: '' });
    fetch(publicApiPath('/api/menu'), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'No se pudo cargar el catálogo.');
        return payload;
      })
      .then((payload) => {
        cacheStorefront(payload);
        if (alive) setState({ loading: false, refreshing: false, payload, error: '' });
      })
      .catch((error) => {
        if (!alive) return;
        setState((current) => current.payload
          ? { ...current, loading: false, refreshing: false, error: '' }
          : { loading: false, refreshing: false, payload: null, error: error?.name === 'AbortError' ? 'La tienda tardó demasiado en responder.' : (error?.message || 'No se pudo cargar la tienda.') });
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
