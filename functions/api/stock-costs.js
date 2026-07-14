// Fase 1 (motor de items/recetas/costeo): endpoint de solo lectura para
// costeo -- separado del dispatcher de ~20 acciones de stock.js a
// proposito, es puramente de reporte/lectura (mas cercano a reports.js
// que a las acciones CRUD de stock.js).
import { resolveTenantId } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';
import { calculateRecipeCost, explodeRecipeForCosting } from './_shared/recipeEngine.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;
    const tenantId = await resolveTenantId(request, env);

    const url = new URL(request.url);
    const recipeId = Number(url.searchParams.get('recipeId') || 0);

    if (recipeId) {
      const recipe = await env.DB.prepare(
        `SELECT id, name, recipe_type, status FROM recipes WHERE tenant_id = ? AND id = ?`
      ).bind(tenantId, recipeId).first();
      if (!recipe) return jsonResponse({ ok: false, error: 'Receta no encontrada.' }, 404);

      const cost = await calculateRecipeCost(env, tenantId, recipeId, 1);
      const tree = await explodeRecipeForCosting(env, tenantId, recipeId, 1);
      return jsonResponse({
        ok: true,
        recipe: { id: recipe.id, name: recipe.name, recipeType: recipe.recipe_type, status: recipe.status },
        cost,
        tree: tree.lines,
      });
    }

    const items = (await env.DB.prepare(`
      SELECT i.id, i.name, i.type, i.family_id, f.name AS family_name, i.current_stock,
             i.purchase_price, i.purchase_unit_quantity, i.is_sellable, i.is_purchasable,
             i.is_producible, i.is_modifier, u.code AS unit_code
      FROM items i
      LEFT JOIN families f ON f.id = i.family_id AND f.tenant_id = i.tenant_id
      LEFT JOIN stock_units u ON u.id = i.unit_id
      WHERE i.tenant_id = ? AND i.is_active = 1
      ORDER BY i.type ASC, i.name ASC
    `).bind(tenantId).all()).results || [];

    const recipeRows = (await env.DB.prepare(`
      SELECT id, name, recipe_type, status, item_id
      FROM recipes
      WHERE tenant_id = ? AND is_active = 1
      ORDER BY recipe_type ASC, name ASC
    `).bind(tenantId).all()).results || [];

    const recipes = [];
    for (const row of recipeRows) {
      const cost = await calculateRecipeCost(env, tenantId, row.id, 1);
      recipes.push({
        id: row.id,
        name: row.name,
        recipeType: row.recipe_type,
        status: row.status,
        hasItemLink: Boolean(row.item_id),
        ...(cost || {}),
      });
    }

    return jsonResponse({ ok: true, items, recipes });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar el costeo.', detail: error.message }, 500);
  }
}
