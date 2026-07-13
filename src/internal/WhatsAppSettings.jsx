import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';

const STATUS_LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  disconnected: 'No conectado',
  expired: 'Token expirado, reconecta',
  error: 'Error de conexion, reconecta',
};

function loadFacebookSdk(appId, graphVersion) {
  return new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = function fbAsyncInit() {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphVersion });
      resolve(window.FB);
    };
    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/es_LA/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook.'));
    document.body.appendChild(script);
  });
}

// Uso: importar en AdminPanel.jsx y renderizar <WhatsAppSettings /> donde
// quieras que aparezca la tarjeta. No necesita props.
export default function WhatsAppSettings() {
  const [status, setStatus] = useState('disconnected');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState(null);
  const signupDataRef = useRef({ wabaId: null, phoneNumberId: null });

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await apiFetch('/api/integrations/whatsapp/status');
      setStatus(result.status || 'disconnected');
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cargar el estado.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Embedded Signup manda el waba_id/phone_number_id por postMessage,
    // SEPARADO del callback de FB.login (que solo da el "code"). Hay que
    // escuchar los dos y juntarlos.
    const sessionInfoListener = (event) => {
      if (event.origin !== 'https://www.facebook.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA')) {
          signupDataRef.current = { wabaId: data.data?.waba_id || null, phoneNumberId: data.data?.phone_number_id || null };
        }
      } catch { /* mensajes que no son JSON del SDK, ignorar */ }
    };
    window.addEventListener('message', sessionInfoListener);
    return () => window.removeEventListener('message', sessionInfoListener);
  }, []);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const config = await apiFetch('/api/integrations/whatsapp/config');
      await loadFacebookSdk(config.appId, config.graphVersion);

      window.FB.login((response) => {
        (async () => {
          if (response.status !== 'connected' || !response.authResponse?.code) {
            setNotice({ type: 'error', message: 'Se canceló la conexión o no se autorizó por completo.' });
            setConnecting(false);
            return;
          }
          const { wabaId, phoneNumberId } = signupDataRef.current;
          if (!wabaId || !phoneNumberId) {
            setNotice({ type: 'error', message: 'No se recibió el WABA o número de WhatsApp del popup. Intenta de nuevo.' });
            setConnecting(false);
            return;
          }
          try {
            await apiFetch('/api/integrations/whatsapp/complete', {
              method: 'POST',
              body: JSON.stringify({ code: response.authResponse.code, wabaId, phoneNumberId }),
            });
            setNotice({ type: 'success', message: 'WhatsApp conectado correctamente.' });
            await loadStatus();
          } catch (error) {
            setNotice({ type: 'error', message: error.message || 'No se pudo completar la conexión.' });
          } finally {
            setConnecting(false);
          }
        })();
      }, {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: 3 },
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo iniciar la conexión.' });
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar WhatsApp? Dejarás de recibir/enviar mensajes hasta que reconectes.')) return;
    setConnecting(true);
    setNotice(null);
    try {
      await apiFetch('/api/integrations/whatsapp/disconnect', { method: 'POST' });
      setStatus('disconnected');
      setNotice({ type: 'success', message: 'WhatsApp desconectado.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo desconectar.' });
    } finally {
      setConnecting(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="payments-settings">
      <h3>WhatsApp Business</h3>
      <div className="payments-provider-row">
        <div>
          <strong>WhatsApp Cloud API</strong>
          <p className="payments-status-label">
            Estado: {loading ? 'Cargando...' : (STATUS_LABELS[status] || status)}
          </p>
        </div>
        {isConnected ? (
          <button type="button" disabled={connecting} onClick={disconnect}>
            {connecting ? 'Procesando...' : 'Desconectar'}
          </button>
        ) : (
          <button type="button" className="primary" disabled={connecting || loading} onClick={connect}>
            {connecting ? 'Conectando...' : 'Conectar WhatsApp'}
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
