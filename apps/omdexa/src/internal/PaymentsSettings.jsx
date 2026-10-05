import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';

const STATUS_LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  disconnected: 'No conectado',
  expired: 'Token expirado, reconecta',
  revoked: 'Acceso revocado, reconecta',
  error: 'Error de conexion, reconecta',
};

// Uso: importar este componente en AdminPanel.jsx y renderizarlo dentro de
// la seccion de configuracion, ej.:
//   import PaymentsSettings from './PaymentsSettings.jsx';
//   ...
//   <PaymentsSettings />
export default function PaymentsSettings() {
  const [status, setStatus] = useState('disconnected');
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await apiFetch('/api/integrations/mercadopago/status');
      setStatus(result.status || 'disconnected');
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cargar el estado.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Si venimos de vuelta del callback OAuth (?mp=connected o ?mp=error),
    // mostramos el resultado una sola vez y limpiamos la URL.
    const params = new URLSearchParams(window.location.search);
    const mpResult = params.get('mp');
    if (mpResult === 'connected') {
      setNotice({ type: 'success', message: 'Mercado Pago conectado correctamente.' });
    } else if (mpResult === 'error') {
      setNotice({ type: 'error', message: `No se pudo conectar Mercado Pago (${params.get('reason') || 'error desconocido'}).` });
    }
    if (mpResult) {
      params.delete('mp');
      params.delete('reason');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
    loadStatus();
  }, []);

  const connect = async () => {
    setActionPending(true);
    setNotice(null);
    try {
      const result = await apiFetch('/api/integrations/mercadopago/connect', { method: 'POST' });
      window.location.href = result.authorizationUrl;
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo iniciar la conexion.' });
      setActionPending(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Mercado Pago? Los clientes no podran pagar en linea hasta que reconectes.')) return;
    setActionPending(true);
    setNotice(null);
    try {
      await apiFetch('/api/integrations/mercadopago/disconnect', { method: 'POST' });
      setStatus('disconnected');
      setNotice({ type: 'success', message: 'Mercado Pago desconectado.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo desconectar.' });
    } finally {
      setActionPending(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="payments-settings">
      <h3>Pagos en linea</h3>
      <div className="payments-provider-row">
        <div>
          <strong>Mercado Pago</strong>
          <p className="payments-status-label">
            Estado: {loading ? 'Cargando...' : (STATUS_LABELS[status] || status)}
          </p>
        </div>
        {isConnected ? (
          <button type="button" disabled={actionPending} onClick={disconnect}>
            {actionPending ? 'Procesando...' : 'Desconectar'}
          </button>
        ) : (
          <button type="button" className="primary" disabled={actionPending || loading} onClick={connect}>
            {actionPending ? 'Redirigiendo...' : 'Conectar Mercado Pago'}
          </button>
        )}
      </div>
      {notice && (
        <p className={notice.type === 'error' ? 'payments-notice-error' : 'payments-notice-success'}>
          {notice.message}
        </p>
      )}
    </div>
  );
}
