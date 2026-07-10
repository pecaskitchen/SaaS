export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function readJson(request) {
  return request.json().catch(() => ({}));
}

export function requireDb(env) {
  if (!env.DB) throw new Error('No hay binding DB.');
  return env.DB;
}
