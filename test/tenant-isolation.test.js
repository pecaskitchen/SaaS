import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantId, UNRESOLVED_TENANT_ID } from '../functions/api/_shared/tenant.js';

function envWithDomains(domains) {
  return {
    DEFAULT_TENANT_ID: 'default',
    PLATFORM_ADMIN_TOKEN: 'platform-secret',
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                if (sql.includes('JOIN saas_tenants')) return domains[values[0]] || null;
                if (sql.includes('SELECT id FROM saas_tenants')) {
                  const requested = values[0];
                  return Object.values(domains).find((item) => item.id === requested || item.slug === requested) || null;
                }
                return null;
              },
              async run() { return { success: true }; },
            };
          },
          async run() { return { success: true }; },
        };
      },
    },
  };
}

test('un tenant no puede cambiarse por query param en un dominio publico', async () => {
  const env = envWithDomains({
    'pecas.mx': { id: 'tenant-pecas', slug: 'pecas', status: 'active' },
    'flilians.pecas.mx': { id: 'tenant-lilians', slug: 'flilians', status: 'active' },
  });
  const request = new Request('https://pecas.mx/api/menu?tenant_id=tenant-lilians');
  assert.equal(await resolveTenantId(request, env), 'tenant-pecas');
});

test('el token de plataforma puede seleccionar tenant explicitamente', async () => {
  const env = envWithDomains({
    'pecas.mx': { id: 'tenant-pecas', slug: 'pecas', status: 'active' },
    'flilians.pecas.mx': { id: 'tenant-lilians', slug: 'flilians', status: 'active' },
  });
  const request = new Request('https://pecas.mx/api/menu?tenant_id=flilians', {
    headers: { 'x-platform-admin-token': 'platform-secret' },
  });
  assert.equal(await resolveTenantId(request, env), 'tenant-lilians');
});

test('un dominio pausado o desconocido no cae al tenant default', async () => {
  const env = envWithDomains({
    'pecas.mx': { id: 'tenant-pecas', slug: 'pecas', status: 'active' },
  });
  const request = new Request('https://test.pecas.mx/api/menu');
  assert.equal(await resolveTenantId(request, env), UNRESOLVED_TENANT_ID);
});
