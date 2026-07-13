import React, { useEffect, useState } from 'react';
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
    // window.FB puede existir (el script lo define apenas se ejecuta) ANTES
    // de que FB.init() haya corrido -- si resolvemos solo por esa
    // existencia, FB.login() se dispara antes de tiempo ("FB.login()
    // called before FB.init()"). FB.init() es seguro de llamar de nuevo,
    // así que lo forzamos acá también en vez de asumir que ya corrió.
    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphVersion });
      resolve(window.FB);
      return;
    }
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

// Uso: importar en AdminPanel.jsx y renderizar <MetaPageSettings />. No
// necesita props. Conecta Messenger siempre, e Instagram automáticamente
// si la Página tiene una cuenta profesional vinculada.
export default function MetaPageSettings() {
  const [status, setStatus] = useState('disconnected');
  const [instagramLinked, setInstagramLinked] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await apiFetch('/api/integrations/meta-page/status');
      setStatus(result.status || 'disconnected');
      setInstagramLinked(Boolean(result.instagramLinked));
      setInstagramUsername(result.instagramUsername || null);
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cargar el estado.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const config = await apiFetch('/api/integrations/meta-page/config');
      await loadFacebookSdk(config.appId, config.graphVersion);

      window.FB.login((response) => {
        (async () => {
          if (response.status !== 'connected' || !response.authResponse?.code) {
            setNotice({ type: 'error', message: 'Se canceló la conexión o no se autorizó por completo.' });
            setConnecting(false);
            return;
          }
          try {
            const result = await apiFetch('/api/integrations/meta-page/complete', {
              method: 'POST',
              body: JSON.stringify({ code: response.authResponse.code }),
            });
            setNotice({
              type: 'success',
              message: result.instagramLinked
                ? `Conectado: página "${result.pageName}" + Instagram @${result.instagramUsername}.`
                : `Conectado: página "${result.pageName}". Instagram no está vinculado a esta página todavía.`,
            });
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
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo iniciar la conexión.' });
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Facebook/Messenger? Dejarás de recibir/enviar mensajes (incluido Instagram si estaba vinculado) hasta que reconectes.')) return;
    setConnecting(true);
    setNotice(null);
    try {
      await apiFetch('/api/integrations/meta-page/disconnect', { method: 'POST' });
      setStatus('disconnected');
      setInstagramLinked(false);
      setNotice({ type: 'success', message: 'Facebook/Messenger desconectado.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo desconectar.' });
    } finally {
      setConnecting(false);
    }
  };

  const recheckInstagram = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const result = await apiFetch('/api/integrations/meta-page/recheck-instagram', { method: 'POST' });
      setInstagramLinked(Boolean(result.instagramLinked));
      setInstagramUsername(result.instagramUsername || null);
      setNotice({
        type: result.instagramLinked ? 'success' : 'error',
        message: result.instagramLinked ? `Instagram vinculado: @${result.instagramUsername}.` : 'Todavía no se detecta Instagram vinculado a esta página.',
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo revisar Instagram.' });
    } finally {
      setConnecting(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="payments-settings">
      <h3>Facebook e Instagram</h3>
      <div className="payments-provider-row">
        <div>
          <strong>Messenger (Página de Facebook)</strong>
          <p className="payments-status-label">
            Estado: {loading ? 'Cargando...' : (STATUS_LABELS[status] || status)}
          </p>
          {isConnected && (
            <p className="payments-status-label">
              Instagram: {instagramLinked ? `vinculado (@${instagramUsername})` : 'no vinculado a esta página'}
            </p>
          )}
        </div>
        {isConnected ? (
          <button type="button" disabled={connecting} onClick={disconnect}>
            {connecting ? 'Procesando...' : 'Desconectar'}
          </button>
        ) : (
          <button type="button" className="primary" disabled={connecting || loading} onClick={connect}>
            {connecting ? 'Conectando...' : 'Conectar Facebook'}
          </button>
        )}
      </div>
      {isConnected && !instagramLinked && (
        <button type="button" disabled={connecting} onClick={recheckInstagram}>
          Verificar Instagram
        </button>
      )}
      {notice && (
        <p className={notice.type === 'error' ? 'payments-notice-error' : 'payments-notice-success'}>
          {notice.message}
        </p>
      )}
    </div>
  );
}
