import { jsonResponse } from './http.js';

export function platformToken(env) {
  return env.PLATFORM_ADMIN_TOKEN || env.PLATFORM_ADMIN_PASSWORD || '';
}

export function requestToken(request) {
  return request.headers.get('x-platform-admin-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
}

export function requirePlatformAdmin(request, env) {
  const expected = platformToken(env);
  if (!expected || requestToken(request) !== expected) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'No autorizado como admin de plataforma.' }, 401) };
  }
  return { ok: true };
}
