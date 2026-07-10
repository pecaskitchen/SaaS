export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request) {
  return request.json().catch(() => ({}));
}

export function nowIso() {
  return new Date().toISOString();
}

export function requireDb(env) {
  if (!env.DB) throw new Error('Falta configurar el binding DB.');
  return env.DB;
}

export function badRequest(message, detail = null) {
  return jsonResponse({ ok: false, error: message, detail }, 400);
}

export function unauthorized(message = 'No autorizado.') {
  return jsonResponse({ ok: false, error: message }, 401);
}

export function forbidden(message = 'No tienes permiso para esta accion.') {
  return jsonResponse({ ok: false, error: message }, 403);
}
