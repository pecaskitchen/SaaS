import React from 'react';
import { ORDER_FORM_FIELD_DEFS, customerFieldValue, isFieldRequired } from '../lib/business.js';

// Renderiza los campos del formulario de pedido segun la config del tenant
// (visible/obligatorio/etiqueta + tipo para los campos extra). Lo comparten
// la pagina publica de pedidos y la caja, cada una con su propia config.

const DEFAULT_FULFILLMENT_OPTIONS = ['Recoger', 'Entrega a domicilio'];
const DEFAULT_PAYMENT_OPTIONS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Mercado Pago'];

// La key del campo no siempre coincide con la key en el objeto `customer`.
const CUSTOMER_KEY = { fulfillment: 'fulfillmentType', note: 'orderNote' };

export default function OrderFormFields({
  config = {},
  customer = {},
  onChange,
  fulfillmentOptions = DEFAULT_FULFILLMENT_OPTIONS,
  paymentOptions = DEFAULT_PAYMENT_OPTIONS,
}) {
  const handle = (fieldKey) => (event) => onChange(CUSTOMER_KEY[fieldKey] || fieldKey, event.target.value);

  return (
    <>
      {ORDER_FORM_FIELD_DEFS.map((def) => {
        const field = config?.[def.key];
        if (!field?.visible) return null;
        const value = customerFieldValue(customer, def.key) || '';
        const required = isFieldRequired(def.key, config, customer);
        const label = field.label || def.defaultLabel;

        if (def.kind === 'fulfillment' || def.kind === 'payment') {
          const options = def.kind === 'fulfillment' ? fulfillmentOptions : paymentOptions;
          return (
            <select key={def.key} required={required} value={value} onChange={handle(def.key)}>
              <option value="">{label}</option>
              {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          );
        }

        if (def.kind === 'textarea') {
          return (
            <textarea
              key={def.key}
              required={required}
              value={value}
              onChange={handle(def.key)}
              placeholder={label}
              rows="2"
            />
          );
        }

        // Campos de una linea: name, address, neighborhood, sector, phone y
        // los 2 extra (con su tipo elegido).
        const type = def.kind === 'custom' ? (field.type || 'text') : def.kind;
        const htmlType = type === 'number' ? 'number' : (type === 'tel' ? 'tel' : 'text');
        const inputMode = type === 'tel' ? 'tel' : (type === 'number' ? 'decimal' : undefined);
        return (
          <input
            key={def.key}
            type={htmlType}
            inputMode={inputMode}
            required={required}
            value={value}
            onChange={handle(def.key)}
            placeholder={label}
          />
        );
      })}
    </>
  );
}
