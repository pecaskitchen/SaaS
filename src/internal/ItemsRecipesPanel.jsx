import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';

const TYPE_LABELS = {
  product: 'Producto',
  ingredient: 'Ingrediente',
  subrecipe: 'Sub-receta',
  packaging: 'Empaque',
  modifier: 'Modificador',
  supply: 'Insumo',
};

function unitCostOf(item) {
  const qty = Number(item.purchase_unit_quantity || 0);
  if (!qty) return null;
  return Number(item.purchase_price || 0) / qty;
}

function money(value) {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toFixed(2)}`;
}

// Uso: importar en AdminPanel.jsx y renderizar <ItemsRecipesPanel />.
// Vista de solo lectura -- NO reemplaza StockPanel.jsx (esa sigue siendo
// la unica forma de crear/editar items, recetas, familias). Esta es la
// vista nueva del motor de costeo de Fase 1: qué existe, cómo está
// clasificado, y cuánto cuesta cada receta.
export default function ItemsRecipesPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [treeRecipeId, setTreeRecipeId] = useState(null);
  const [tree, setTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch('/api/stock-costs');
      setItems(result.items || []);
      setRecipes(result.recipes || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el costeo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (term && !String(item.name || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, typeFilter, search]);

  const openTree = async (recipeId) => {
    setTreeRecipeId(recipeId);
    setTree(null);
    setTreeLoading(true);
    try {
      const result = await apiFetch(`/api/stock-costs?recipeId=${recipeId}`);
      setTree(result);
    } catch (err) {
      setTree({ error: err.message || 'No se pudo cargar la receta.' });
    } finally {
      setTreeLoading(false);
    }
  };

  if (loading) return <p className="admin-status">Cargando costeo…</p>;
  if (error) return <p className="admin-status">{error}</p>;

  return (
    <div>
      <p className="privacy-note">
        Vista de solo lectura del motor de costos (Fase 1). Para crear o editar items, recetas y familias sigue usando
        "Catálogo operativo" más abajo -- esta pantalla solo muestra cómo quedaron clasificados y cuánto cuesta cada receta.
      </p>

      <h4>Items ({filteredItems.length} de {items.length})</h4>
      <div className="inline-actions">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input placeholder="Buscar por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '4px 8px' }}>Nombre</th>
              <th style={{ padding: '4px 8px' }}>Tipo</th>
              <th style={{ padding: '4px 8px' }}>Familia</th>
              <th style={{ padding: '4px 8px' }}>Stock</th>
              <th style={{ padding: '4px 8px' }}>Unidad</th>
              <th style={{ padding: '4px 8px' }}>Costo/unidad</th>
              <th style={{ padding: '4px 8px' }}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px' }}>{item.name}</td>
                <td style={{ padding: '4px 8px' }}>{TYPE_LABELS[item.type] || item.type || '—'}</td>
                <td style={{ padding: '4px 8px' }}>{item.family_name || '—'}</td>
                <td style={{ padding: '4px 8px' }}>{item.current_stock}</td>
                <td style={{ padding: '4px 8px' }}>{item.unit_code || '—'}</td>
                <td style={{ padding: '4px 8px' }}>{money(unitCostOf(item))}</td>
                <td style={{ padding: '4px 8px' }}>
                  {item.is_sellable ? 'Vendible ' : ''}
                  {item.is_producible ? 'Producible ' : ''}
                  {item.is_modifier ? 'Modificador ' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ marginTop: '1.5em' }}>Recetas y costos ({recipes.length})</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: '4px 8px' }}>Receta</th>
              <th style={{ padding: '4px 8px' }}>Tipo</th>
              <th style={{ padding: '4px 8px' }}>Estado</th>
              <th style={{ padding: '4px 8px' }}>Costo</th>
              <th style={{ padding: '4px 8px' }}>Precio</th>
              <th style={{ padding: '4px 8px' }}>Margen</th>
              <th style={{ padding: '4px 8px' }}>Margen %</th>
              <th style={{ padding: '4px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((recipe) => (
              <tr key={recipe.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px' }}>
                  {recipe.name}
                  {!recipe.hasItemLink && <span title="Sin enlace a producto todavia"> ⚠️</span>}
                  {recipe.costUnknownItems?.length > 0 && (
                    <span title={`Costo desconocido: ${recipe.costUnknownItems.join(', ')}`}> ❓</span>
                  )}
                </td>
                <td style={{ padding: '4px 8px' }}>{recipe.recipeType === 'subrecipe' ? 'Sub-receta' : 'Producto'}</td>
                <td style={{ padding: '4px 8px' }}>{recipe.status || '—'}</td>
                <td style={{ padding: '4px 8px' }}>{money(recipe.costTotal)}</td>
                <td style={{ padding: '4px 8px' }}>{money(recipe.price)}</td>
                <td style={{ padding: '4px 8px' }}>{money(recipe.grossMargin)}</td>
                <td style={{ padding: '4px 8px' }}>{recipe.grossMarginPercent !== null && recipe.grossMarginPercent !== undefined ? `${recipe.grossMarginPercent}%` : '—'}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button type="button" className="ghost mini" onClick={() => openTree(recipe.id)}>Ver árbol</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {treeRecipeId && (
        <div className="stock-card-block" style={{ marginTop: '1em' }}>
          <div className="inline-actions">
            <strong>Árbol de explosión</strong>
            <button type="button" className="ghost mini" onClick={() => { setTreeRecipeId(null); setTree(null); }}>Cerrar</button>
          </div>
          {treeLoading && <p className="admin-status">Cargando…</p>}
          {!treeLoading && tree?.error && <p className="admin-status">{tree.error}</p>}
          {!treeLoading && tree && !tree.error && (
            <ul>
              {(tree.tree || []).map((line) => (
                <li key={line.itemId}>
                  {line.itemName}: {line.quantity} {line.unitCode}
                </li>
              ))}
              {(tree.tree || []).length === 0 && <li>Esta receta no tiene líneas.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
