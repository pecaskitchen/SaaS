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

export async function apiFetch(path, options = {}) {
  const token = getSessionToken();
  const response = await fetch(path, {
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
