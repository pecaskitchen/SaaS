import React, { Suspense, lazy } from 'react';

const StockPanel = lazy(() => import('./StockPanel.jsx'));
const ItemsRecipesPanel = lazy(() => import('./ItemsRecipesPanel.jsx'));

// Modulo "Recetas" del shell: reune el catalogo operativo de Stock
// (Productos / Ingredientes / Recetas-Sub / Familias / Import) y el panel
// de Costos y recetas. Estas secciones vivian solo en la vista 'all' de
// AdminPanel, que ningun flujo monta desde la reorganizacion por modulos,
// asi que habian quedado inalcanzables en toda la app.
export default function RecipesPanel() {
  return (
    <div className="settings-stack">
      <Suspense fallback={<main className="app-loading" aria-label="Cargando recetas" />}>
        <StockPanel mode="adminConfig" />
        <section className="admin-section">
          <ItemsRecipesPanel />
        </section>
      </Suspense>
    </div>
  );
}
