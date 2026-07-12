export function getSessionToken() {
  try {
    return window.sessionStorage.getItem('app_session_token') || '';
  } catch {
    return '';
  }
}

export function setSessionToken(token) {
  try {
    if (token) window.sessionStorage.setItem('app_session_token', token);
    else window.sessionStorage.removeItem('app_session_token');
  } catch {
    // ignore storage errors
  }
}

export function currentTenantQuery() {
  if (!isLocalDevHost()) return '';
  try {
    const tenantId = new URL(window.location.href).searchParams.get('tenant_id');
    const clean = String(tenantId || '').trim().replace(/^\/+|\/+$/g, '');
    return clean || '';
  } catch {
    return '';
  }
}

export function withTenantQuery(path) {
  const tenantId = currentTenantQuery();
  if (!tenantId) return path;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return path;
    if (!url.searchParams.has('tenant_id')) url.searchParams.set('tenant_id', tenantId);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

// El override de tenant_id por query param solo tiene un uso legítimo:
// probar el cambio de tenant en desarrollo local (localhost) sin tener que
// levantar varios hostnames. En cualquier otro host, el backend ya lo
// ignora (ver _shared/tenant.js, allowsExplicitTenantForPreview) salvo con
// token de plataforma — pero antes igual se instalaba este interceptor
// global de window.fetch para TODOS los visitantes del sitio (incluyendo el
// storefront público), lo cual no servía para nada en producción y dejaba
// código de parcheo global corriendo de más. Ahora solo se activa si
// realmente estás en localhost.
function isLocalDevHost() {
  try {
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
  } catch {
    return false;
  }
}

export function installTenantFetchInterceptor() {
  if (typeof window === 'undefined' || window.__tenantFetchInterceptorInstalled) return;
  if (!isLocalDevHost()) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') return originalFetch(withTenantQuery(input), init);
    if (input instanceof Request) {
      try {
        const url = new URL(input.url);
        const tenantId = currentTenantQuery();
        if (tenantId && url.origin === window.location.origin && url.pathname.startsWith('/api/') && !url.searchParams.has('tenant_id')) {
          url.searchParams.set('tenant_id', tenantId);
          return originalFetch(new Request(url.toString(), input), init);
        }
      } catch {
        // Fall through to original request.
      }
    }
    return originalFetch(input, init);
  };
  window.__tenantFetchInterceptorInstalled = true;
}

export async function apiFetch(path, options = {}) {
  const token = getSessionToken();
  const response = await fetch(withTenantQuery(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.detail || data.error || 'Error de API.');
  return data;
}
