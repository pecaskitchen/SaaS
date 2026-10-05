import React, { useState } from 'react';
import { useAuth } from './auth/AuthContext.jsx';
import './styles.css';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setStatus('Escribe tu email y tu contrasena.');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      await login(email.trim(), password);
      window.location.hash = '#panel';
    } catch (error) {
      setStatus(error.message || 'No se pudo iniciar sesion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-page">
      <section className="admin-card" style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 38px)' }}>Iniciar sesion</h1>
        <p>Entra con tu cuenta para acceder a tu panel.</p>
        <form className="admin-login" onSubmit={submit}>
          <label className="field full">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
          </label>
          <label className="field full">
            <span>Contrasena</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contrasena"
            />
          </label>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          {status && <p className="admin-status">{status}</p>}
        </form>
      </section>
    </main>
  );
}
