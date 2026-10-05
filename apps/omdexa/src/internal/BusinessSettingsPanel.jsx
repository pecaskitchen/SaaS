import React from 'react';
import AdminRoute from './AdminRoute.jsx';
import BusinessConfigCenter from './BusinessConfigCenter.jsx';

export default function BusinessSettingsPanel() {
  return (
    <>
      <BusinessConfigCenter
        section="business"
        title="Datos operativos"
        description="Contacto, formas de pago, tipos de entrega y origenes de pedido."
      />
      <AdminRoute view="business" />
    </>
  );
}
