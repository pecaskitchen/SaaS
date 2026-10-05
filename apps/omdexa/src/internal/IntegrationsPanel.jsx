import React, { Suspense } from 'react';

const PaymentsSettings = React.lazy(() => import('./PaymentsSettings.jsx'));
const WhatsAppSettings = React.lazy(() => import('./WhatsAppSettings.jsx'));
export default function IntegrationsPanel() {
  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Integraciones</p>
          <h2>Canales y pagos</h2>
          <p>Conecta servicios externos del negocio sin mezclar estos ajustes con el menu o la operacion diaria.</p>
        </div>
      </div>

      <Suspense fallback={<p className="admin-status">Cargando integraciones...</p>}>
        <div className="settings-stack">
          <section className="admin-order-box">
            <h2>Mercado Pago</h2>
            <PaymentsSettings />
          </section>
          <section className="admin-order-box">
            <h2>WhatsApp Business</h2>
            <WhatsAppSettings />
          </section>
          <section className="admin-order-box integration-disabled">
            <h2>Messenger e Instagram</h2>
            <p className="muted-line">No habilitados por ahora. Cuando decidas configurarlos, se activarán sobre el mismo motor de conversación de WhatsApp.</p>
          </section>
        </div>
      </Suspense>
    </section>
  );
}
