import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusinessHours, businessStatus } from '../src/lib/business.js';

test('normalizeBusinessHours: produce 7 dias con open/close', () => {
  const normalized = normalizeBusinessHours({});
  assert.equal(normalized.days.length, 7);
  for (const day of normalized.days) {
    assert.ok(Number.isFinite(day.day));
    assert.ok('open' in day && 'close' in day && 'active' in day);
  }
});

test('businessStatus: dia inactivo reporta cerrado sin importar la hora', () => {
  const allClosed = normalizeBusinessHours({});
  allClosed.days = allClosed.days.map((day) => ({ ...day, active: false }));
  const status = businessStatus(allClosed);
  assert.equal(status.open, false);
});

test('businessStatus: siempre devuelve un objeto con open (boolean) y label', () => {
  const status = businessStatus(normalizeBusinessHours({}));
  assert.equal(typeof status.open, 'boolean');
  assert.equal(typeof status.label, 'string');
});
