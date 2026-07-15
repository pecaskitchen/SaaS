import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { getSessionToken } from '../lib/apiClient.js';

const REPORT_TYPES = [
  ['sales_orders', 'Ventas por pedido'],
  ['sales_products', 'Ventas por producto'],
  ['source_summary', 'Online vs Caja'],
  ['payment_summary', 'Pagos'],
  ['category_sales', 'Ventas por categoria'],
  ['branch_summary', 'Resumen por sucursal'],
  ['stock_movements', 'Movimientos de stock'],
  ['waste', 'Mermas'],
  ['purchase_suggestions', 'Compra sugerida'],
  ['inventory_value', 'Inventario valorizado'],
  ['sold_out', 'Agotados'],
];

function isoDate(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export default function ReportDownloadsPanel() {
  const [type, setType] = useState('sales_orders');
  const [start, setStart] = useState(isoDate(7));
  const [end, setEnd] = useState(isoDate(0));
  const [branchId, setBranchId] = useState('all');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const download = async () => {
    const token = getSessionToken();
    if (!token) {
      setStatus('Inicia sesion para descargar reportes.');
      return;
    }
    setLoading(true);
    setStatus('Preparando reporte...');
    try {
      const params = new URLSearchParams({ type, start, end, branchId });
      const response = await fetch(`/api/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'No se pudo descargar reporte.');
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `saas-${type}-${start}-${end}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Reporte descargado.');
    } catch (error) {
      setStatus(error.message || 'No se pudo descargar reporte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-section" style={{ marginTop: 18 }}>
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Exportaciones</p>
          <h2>Descargar reportes</h2>
          <p>Los pedidos archivados o eliminados no cuentan en ventas ni CRM.</p>
        </div>
      </div>
      <div className="admin-promo-grid">
        <label className="field"><span>Reporte</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {REPORT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>Inicio</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label className="field"><span>Fin</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <label className="field"><span>Sucursal</span><input value={branchId} onChange={(event) => setBranchId(event.target.value)} placeholder="all o id de sucursal" /></label>
        <div className="inline-actions">
          <button type="button" className="primary" onClick={download} disabled={loading}>
            <Download size={16} /> {loading ? 'Descargando...' : 'Descargar CSV'}
          </button>
        </div>
      </div>
      {status ? <p className="admin-status">{status}</p> : null}
    </section>
  );
}
