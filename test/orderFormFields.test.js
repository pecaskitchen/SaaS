import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFormFields,
  firstMissingRequiredField,
  customFieldsPayload,
  isFieldRequired,
  normalizeBranchSettings,
} from '../src/lib/business.js';

test('normalizeFormFields: defaults de la pagina de clientes = comportamiento actual', () => {
  const cfg = normalizeFormFields({}, 'order');
  assert.equal(cfg.name.visible, true);
  assert.equal(cfg.phone.required, true);
  assert.equal(cfg.custom1.visible, false); // extra oculto por default
  assert.equal(cfg.note.required, false);
});

test('normalizeFormFields: caja oculta direccion/pago por default', () => {
  const cfg = normalizeFormFields({}, 'cashier');
  assert.equal(cfg.phone.visible, true);
  assert.equal(cfg.address.visible, false);
  assert.equal(cfg.payment.visible, false);
});

test('normalizeFormFields: campo extra sin etiqueta no se muestra aunque se marque visible', () => {
  const cfg = normalizeFormFields({ custom1: { visible: true, label: '' } }, 'order');
  assert.equal(cfg.custom1.visible, false);
  const cfg2 = normalizeFormFields({ custom1: { visible: true, label: 'RFC', type: 'text' } }, 'order');
  assert.equal(cfg2.custom1.visible, true);
  assert.equal(cfg2.custom1.label, 'RFC');
});

test('normalizeFormFields: tipo invalido de campo extra cae a texto', () => {
  const cfg = normalizeFormFields({ custom1: { label: 'Edad', type: 'raro' } }, 'order');
  assert.equal(cfg.custom1.type, 'text');
  const cfg2 = normalizeFormFields({ custom1: { label: 'Edad', type: 'number' } }, 'order');
  assert.equal(cfg2.custom1.type, 'number');
});

test('isFieldRequired: direccion es obligatoria si es entrega a domicilio', () => {
  const cfg = normalizeFormFields({ address: { visible: true, required: false } }, 'order');
  assert.equal(isFieldRequired('address', cfg, { fulfillmentType: 'Recoger' }), false);
  assert.equal(isFieldRequired('address', cfg, { fulfillmentType: 'Entrega a domicilio' }), true);
});

test('firstMissingRequiredField: reporta la etiqueta del campo obligatorio vacio', () => {
  const cfg = normalizeFormFields({ phone: { visible: true, required: true, label: 'WhatsApp' } }, 'order');
  assert.equal(firstMissingRequiredField({ name: 'Ana', phone: '' }, cfg), 'WhatsApp');
  assert.equal(firstMissingRequiredField({ name: 'Ana', phone: '8112345678', fulfillmentType: 'Recoger', payment: 'Efectivo' }, cfg), null);
});

test('customFieldsPayload: solo incluye campos extra visibles y con valor', () => {
  const cfg = normalizeFormFields({
    custom1: { visible: true, label: 'RFC', type: 'text' },
    custom2: { visible: true, label: 'Placa', type: 'text' },
  }, 'order');
  const payload = customFieldsPayload({ custom1: 'ABC123', custom2: '' }, cfg);
  assert.equal(payload.length, 1);
  assert.deepEqual(payload[0], { key: 'custom1', label: 'RFC', type: 'text', value: 'ABC123' });
});

test('normalizeBranchSettings: incluye orderFormFields y cashierFormFields', () => {
  const settings = normalizeBranchSettings({});
  assert.ok(settings.orderFormFields && settings.cashierFormFields);
  assert.equal(settings.orderFormFields.name.visible, true);
});
