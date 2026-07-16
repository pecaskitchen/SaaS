import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmount, nextReceivableStatus } from '../functions/api/_shared/receivables.js';

test('normalizeAmount: redondea, recorta negativos y maneja basura', () => {
  assert.equal(normalizeAmount(10.4), 10);
  assert.equal(normalizeAmount(10.6), 11);
  assert.equal(normalizeAmount(-5), 0);
  assert.equal(normalizeAmount('abc'), 0);
  assert.equal(normalizeAmount(null), 0);
  assert.equal(normalizeAmount(250), 250);
});

test('nextReceivableStatus: saldo cubierto = pagado', () => {
  assert.equal(nextReceivableStatus({ status: 'active', principal_amount: 100, due_date: '' }, 100), 'paid');
  assert.equal(nextReceivableStatus({ status: 'active', principal_amount: 100, due_date: '' }, 150), 'paid');
});

test('nextReceivableStatus: saldo parcial sin vencimiento = activo', () => {
  assert.equal(nextReceivableStatus({ status: 'active', principal_amount: 100, due_date: '' }, 40), 'active');
});

test('nextReceivableStatus: saldo parcial con fecha vencida = vencido', () => {
  assert.equal(nextReceivableStatus({ status: 'active', principal_amount: 100, due_date: '2000-01-01' }, 40), 'overdue');
});

test('nextReceivableStatus: canceladas y condonadas no cambian', () => {
  assert.equal(nextReceivableStatus({ status: 'cancelled', principal_amount: 100 }, 0), 'cancelled');
  assert.equal(nextReceivableStatus({ status: 'written_off', principal_amount: 100 }, 100), 'written_off');
});
