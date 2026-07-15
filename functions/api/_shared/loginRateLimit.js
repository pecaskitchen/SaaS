import { requireDb, nowIso } from './http.js';

// Rate limit sencillo de intentos de login sobre D1 (ventana fija).
// Sin esto, /api/portal-login permitia fuerza bruta de credenciales de
// cualquier tenant desde omdexa.com (el lookup de negocio lo controla el
// cliente), y /api/auth/login tampoco tenia freno por IP.
//
// Regla: max MAX_ATTEMPTS fallos por (ip + email) dentro de WINDOW_MINUTES.
// Un login exitoso limpia el contador. La tabla se crea on-demand igual que
// el resto de ensure* del proyecto.
const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 10;

let tableEnsured = false;

async function ensureTable(db) {
  if (tableEnsured) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_start_utc TEXT NOT NULL
    )
  `).run();
  tableEnsured = true;
}

function attemptKey(request, email) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'sin-ip';
  return `${ip}|${String(email || '').trim().toLowerCase()}`;
}

function windowExpired(windowStartUtc) {
  const started = new Date(windowStartUtc).getTime();
  if (Number.isNaN(started)) return true;
  return Date.now() - started > WINDOW_MINUTES * 60 * 1000;
}

/**
 * Llamar ANTES de verificar credenciales. Si devuelve { limited: true },
 * responder 429 sin tocar la base de usuarios.
 */
export async function checkLoginRateLimit(env, request, email) {
  try {
    const db = requireDb(env);
    await ensureTable(db);
    const key = attemptKey(request, email);
    const row = await db.prepare(`SELECT attempts, window_start_utc FROM login_attempts WHERE attempt_key = ?`).bind(key).first();
    if (!row || windowExpired(row.window_start_utc)) return { limited: false, key };
    if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
      return { limited: true, key, retryMinutes: WINDOW_MINUTES };
    }
    return { limited: false, key };
  } catch {
    // Si el rate limit falla (p. ej. sin binding DB) no bloqueamos el login;
    // la verificacion de credenciales sigue siendo la barrera real.
    return { limited: false, key: '' };
  }
}

/** Llamar cuando las credenciales resultaron invalidas. */
export async function recordLoginFailure(env, request, email) {
  try {
    const db = requireDb(env);
    await ensureTable(db);
    const key = attemptKey(request, email);
    const now = nowIso();
    await db.prepare(`
      INSERT INTO login_attempts (attempt_key, attempts, window_start_utc)
      VALUES (?, 1, ?)
      ON CONFLICT(attempt_key) DO UPDATE SET
        attempts = CASE
          WHEN (julianday(?) - julianday(login_attempts.window_start_utc)) * 24 * 60 > ${WINDOW_MINUTES}
          THEN 1
          ELSE login_attempts.attempts + 1
        END,
        window_start_utc = CASE
          WHEN (julianday(?) - julianday(login_attempts.window_start_utc)) * 24 * 60 > ${WINDOW_MINUTES}
          THEN ?
          ELSE login_attempts.window_start_utc
        END
    `).bind(key, now, now, now, now).run();
  } catch {
    // No bloquear el flujo de login por un fallo del contador.
  }
}

/** Llamar tras un login exitoso para limpiar el contador. */
export async function clearLoginFailures(env, request, email) {
  try {
    const db = requireDb(env);
    await ensureTable(db);
    await db.prepare(`DELETE FROM login_attempts WHERE attempt_key = ?`).bind(attemptKey(request, email)).run();
  } catch {
    // ignore
  }
}
