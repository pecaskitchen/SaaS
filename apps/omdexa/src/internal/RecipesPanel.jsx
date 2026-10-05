import React, { Suspense, lazy } from 'react';

const StockPanel = lazy(() => import('./StockPanel.jsx'));
const ItemsRecipesPanel = lazy(() => import('./ItemsRecipesPanel.jsx'));

// Módulo único para configurar productos, ingredientes, preparaciones,
// opciones del cliente y consultar costos.
export default function RecipesPanel() {
  return (
    <div className="settings-stack">
      <Suspense fallback={<main className="app-loading" aria-label="Cargando recetas" />}>
        <StockPanel mode="adminConfig" />
        <details className="admin-section advanced-cost-summary">
          <summary>Ver resumen detallado de costos y márgenes</summary>
          <ItemsRecipesPanel />
        </details>
      </Suspense>
    </div>
  );
}
