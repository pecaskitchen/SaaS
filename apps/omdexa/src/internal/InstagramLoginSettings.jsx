import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';

const STATUS_LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  disconnected: 'No conectado',
  expired: 'Token expirado, reconecta',
  error: 'Error de conexion, reconecta',
};

// Instagram API with Instagram Login es un redirect OAuth clásico (no hay
// SDK/postMessage como Facebook Login) -- se abre un popup a
// instagram.com, y como es otro origen no podemos leer su URL hasta que
// vuelve a nuestro propio dominio (redirect_uri). Ahí sí, por same-origin,
// se puede leer popup.location y sacar el ?code=.
const CALLBACK_MARKER = 'ig_oauth_callback';

// Uso: importar en AdminPanel.jsx y renderizar <InstagramLoginSettings />.
// Para negocios cuyo Instagram no está vinculado a ninguna Página de
// Facebook (ver MetaPageSettings para el caso vinculado).
export default function InstagramLoginSettings() {
  const [status, setStatus] = useState('disconnected');
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState(null);
  const pollRef = useRef(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await apiFetch('/api/integrations/instagram-login/status');
      setStatus(result.status || 'disconnected');
      setUsername(result.username || null);
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cargar el estado.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const config = await apiFetch('/api/integrations/instagram-login/config');
      const redirectUri = new URL(config.authorizationUrl).searchParams.get('redirect_uri') || `${window.location.origin}/?${CALLBACK_MARKER}=1`;
      const popup = window.open(config.authorizationUrl, 'instagram-login', 'width=500,height=700');
      if (!popup) {
        setNotice({ type: 'error', message: 'El navegador bloqueó el popup. Habilítalo e intenta de nuevo.' });
        setConnecting(false);
        return;
      }

      pollRef.current = setInterval(async () => {
        let href = null;
        try { href = popup.location.href; } catch { /* todavía en instagram.com, otro origen */ }

        if (popup.closed) {
          clearInterval(pollRef.current);
          setConnecting(false);
          return;
        }
        if (!href || !href.startsWith(window.location.origin)) return;

        clearInterval(pollRef.current);
        const url = new URL(href);
        popup.close();
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error || !code) {
          setNotice({ type: 'error', message: 'Se canceló la conexión o no se autorizó por completo.' });
          setConnecting(false);
          return;
        }
        try {
          const result = await apiFetch('/api/integrations/instagram-login/complete', {
            method: 'POST',
            body: JSON.stringify({ code, redirectUri }),
          });
          setNotice({ type: 'success', message: `Instagram conectado: @${result.username}.` });
          await loadStatus();
        } catch (completeError) {
          setNotice({ type: 'error', message: completeError.message || 'No se pudo completar la conexión.' });
        } finally {
          setConnecting(false);
        }
      }, 700);
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo iniciar la conexión.' });
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Instagram? Dejarás de recibir/enviar mensajes hasta que reconectes.')) return;
    setConnecting(true);
    setNotice(null);
    try {
      await apiFetch('/api/integrations/instagram-login/disconnect', { method: 'POST' });
      setStatus('disconnected');
      setNotice({ type: 'success', message: 'Instagram desconectado.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo desconectar.' });
    } finally {
      setConnecting(false);
    }
  };

  const isConnected = status === 'connected';

  return (
    <div className="payments-settings">
      <h3>Instagram (conexión directa)</h3>
      <p className="payments-status-label">Para cuando tu Instagram no está vinculado a tu Página de Facebook.</p>
      <div className="payments-provider-row">
        <div>
          <strong>Instagram Business</strong>
          <p className="payments-status-label">
            Estado: {loading ? 'Cargando...' : (STATUS_LABELS[status] || status)}{username ? ` (@${username})` : ''}
          </p>
        </div>
        {isConnected ? (
          <button type="button" disabled={connecting} onClick={disconnect}>
            {connecting ? 'Procesando...' : 'Desconectar'}
          </button>
        ) : (
          <button type="button" className="primary" disabled={connecting || loading} onClick={connect}>
            {connecting ? 'Conectando...' : 'Conectar Instagram'}
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
