import React, { useEffect, useState } from 'react';
import { UserPlus, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/apiClient.js';

const ROLE_LABELS = {
  admin: 'Dueño / Admin',
  manager: 'Gerente',
  cashier: 'Caja',
  orders: 'Pedidos',
  inventory: 'Inventario',
  reports: 'Reportes',
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

const emptyDraft = { name: '', email: '', password: '', role: 'cashier' };

export default function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setStatus('');
    try {
      const data = await apiFetch('/api/users');
      setUsers(data.users || []);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createUser = async (event) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.email.trim() || !draft.password || !draft.role) {
      setStatus('Completa nombre, email, contraseña y rol.');
      return;
    }
    setLoading(true);
    setStatus('Creando usuario...');
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(draft) });
      setDraft(emptyDraft);
      setStatus('Usuario creado.');
      await load();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (id, patch) => {
    setLoading(true);
    setStatus('Guardando...');
    try {
      await apiFetch('/api/users', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
      setStatus('Actualizado.');
      await load();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Configuración</p>
          <h2>Usuarios y roles</h2>
          <p>Cuentas de tu equipo para entrar con email y contraseña.</p>
        </div>
        <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
      </div>

      <form className="admin-promo-grid" onSubmit={createUser} style={{ marginTop: 16 }}>
        <label className="field"><span>Nombre</span>
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nombre completo" />
        </label>
        <label className="field"><span>Email</span>
          <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="correo@ejemplo.com" />
        </label>
        <label className="field"><span>Contraseña</span>
          <input type="password" value={draft.password} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
        </label>
        <label className="field"><span>Rol</span>
          <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>
            {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </label>
        <div className="inline-actions">
          <button type="submit" className="primary" disabled={loading}><UserPlus size={16} /> Crear usuario</button>
        </div>
      </form>
      {status && <p className="admin-status">{status}</p>}

      <div className="admin-products" style={{ marginTop: 24 }}>
        {users.map((user) => (
          <div className="admin-product" key={user.id}>
            <div className="admin-product-head">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <label className="field"><span>Rol</span>
              <select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <label className="field"><span>Status</span>
              <select value={user.status} onChange={(e) => updateUser(user.id, { status: e.target.value })}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>
          </div>
        ))}
        {users.length === 0 && !loading && <p>Todavía no hay cuentas de equipo. Crea la primera arriba.</p>}
      </div>
    </section>
  );
}
