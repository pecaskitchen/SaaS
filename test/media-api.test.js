import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as uploadMedia } from '../functions/api/admin/media.js';
import { onRequestGet as readMedia } from '../functions/api/media/[asset].js';

test('la subida directa exige una sesión administrativa', async () => {
  const response = await uploadMedia({ request: new Request('https://pecas.mx/api/admin/media', { method: 'POST' }), env: {} });
  assert.equal(response.status, 401);
});

test('una ruta de medio inválida responde 404 sin consultar almacenamiento', async () => {
  const response = await readMedia({ request: new Request('https://pecas.mx/api/media/no-valido'), env: {}, params: { asset: 'no-valido' } });
  assert.equal(response.status, 404);
});
