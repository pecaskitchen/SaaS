function base64url(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(payload, secret, expiresInSeconds = 60 * 60 * 12) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedBody = base64url(new TextEncoder().encode(JSON.stringify(body)));
  const input = `${encodedHeader}.${encodedBody}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(input));
  return `${input}.${base64url(signature)}`;
}

export async function verifyToken(token, secret) {
  const [encodedHeader, encodedBody, encodedSignature] = String(token || '').split('.');
  if (!encodedHeader || !encodedBody || !encodedSignature) throw new Error('Token invalido.');
  const input = `${encodedHeader}.${encodedBody}`;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    fromBase64url(encodedSignature),
    new TextEncoder().encode(input),
  );
  if (!ok) throw new Error('Firma invalida.');
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(encodedBody)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado.');
  return payload;
}

// MEJORADO (ver auditoria-saas-multitenant.md, hallazgo #8): un solo
// SHA-256 con salt es barato de romper por fuerza bruta en GPU. PBKDF2 con
// 100,000 iteraciones para respetar el limite de Web Crypto en Cloudflare Pages Functions es
// soportado nativamente por Web Crypto en Cloudflare Workers, sin
// dependencias externas.
const PBKDF2_ITERATIONS = 100000;

export async function hashPassword(password, salt = crypto.randomUUID()) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${base64url(derived)}`;
}

async function verifyLegacySha256(password, salt, expectedHash) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(digest) === expectedHash;
}

export async function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash || '').split(':');
  if (parts[0] === 'pbkdf2' && parts.length === 4) {
    const [, , salt] = parts;
    return await hashPassword(password, salt) === passwordHash;
  }
  // Compatibilidad con hashes antiguos (sha256:salt:hash) creados antes de
  // este cambio, para no invalidar sesiones de golpe. Al hacer login exitoso
  // con un hash legacy, quien llame a verifyPassword debería re-hashear y
  // guardar el nuevo formato (ver auth/login.js).
  if (parts[0] === 'sha256' && parts.length === 3) {
    const [, salt, expectedHash] = parts;
    if (!salt) return false;
    return await verifyLegacySha256(password, salt, expectedHash);
  }
  return false;
}

export function isLegacyPasswordHash(passwordHash) {
  return String(passwordHash || '').startsWith('sha256:');
}
