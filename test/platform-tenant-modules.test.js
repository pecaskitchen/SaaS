import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultModuleForRole, modulesForRole } from '../apps/omdexa/src/internal/modules.js';

test('platform admin sin tenant conserva la vista de plataforma', () => {
  assert.deepEqual(modulesForRole('platform_admin', {}, false).map((module) => module.id), ['plataforma']);
  assert.equal(defaultModuleForRole('platform_admin', {}, false), 'plataforma');
});

test('platform admin dentro de un tenant ve usuarios y reportes', () => {
  const ids = modulesForRole('platform_admin', { businessType: 'retail' }, true).map((module) => module.id);
  assert.ok(ids.includes('usuarios'));
  assert.ok(ids.includes('reportes'));
  assert.equal(defaultModuleForRole('platform_admin', { businessType: 'retail' }, true), 'inicio');
});
