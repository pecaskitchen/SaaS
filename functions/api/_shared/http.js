export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function unauthorized(error = 'No autorizado.') {
  return jsonResponse({ ok: false, error }, 401);
}

export function forbidden(error = 'Sin permiso.') {
  return jsonResponse({ ok: false, error }, 403);
}

export function nowIso() {
  return new Date().toISOString();
}

export async function readJson(request) {
  return request.json().catch(() => ({}));
}

export function requireDb(env) {
  if (!env.DB) throw new Error('No hay binding DB.');
  return env.DB;
}
