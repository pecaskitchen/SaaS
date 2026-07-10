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

export async function hashPassword(password, salt = crypto.randomUUID()) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `sha256:${salt}:${base64url(digest)}`;
}

export async function verifyPassword(password, passwordHash) {
  const [, salt] = String(passwordHash || '').split(':');
  if (!salt) return false;
  return await hashPassword(password, salt) === passwordHash;
}
