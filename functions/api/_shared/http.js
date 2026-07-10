export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function readJson(request) {
  return request.json().catch(() => ({}));
}

export function nowIso() {
  return new Date().toISOString();
}

export function requireDb(env) {
  if (!env.DB) throw new Error('Falta configurar el binding DB.');
  return env.DB;
}
