import { resolveTenantId } from './_shared/tenant.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function productIdFromRecipeKey(recipeKey) {
  const value = String(recipeKey || '');
  return value.startsWith('product:') ? value.slice('product:'.length) : value;
}

function isDressingLine(line) {
  const role = String(line.line_role || '').toLowerCase();
  const name = String(line.item_name || '').toLowerCase();
  return role === 'aderezo_interno' || name.includes('aderezo') || name.includes('chipotle') || name.includes('blue cheese') || name.includes('barbecue');
}

function pushUnique(list, item) {
  const key = String(item.name || '').trim().toLowerCase();
  if (!key) return;
  if (list.some((entry) => String(entry.name || '').trim().toLowerCase() === key)) return;
  list.push(item);
}

// CORREGIDO: este endpoint es público (lo consume el cliente final en el
// menú) pero antes no filtraba por tenant_id en NINGUNA consulta, por lo
// que devolvía recetas, insumos, marcas y precios de TODOS los negocios de
// la plataforma a cualquier visitante de cualquier subdominio. Ahora se
// resuelve el tenant de la petición y se agrega a cada WHERE/JOIN.
export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'No hay binding DB.' }, 500);

    const tenantId = await resolveTenantId(request, env);

    const tableCheck = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('recipes', 'recipe_lines', 'items')`
    ).all();
    const tables = new Set((tableCheck.results || []).map((row) => row.name));
    if (!tables.has('recipes') || !tables.has('recipe_lines') || !tables.has('items')) {
      return jsonResponse({ ok: true, products: {} });
    }

    const result = await env.DB.prepare(
      `SELECT
        r.recipe_key,
        l.id AS line_id,
        l.quantity,
        l.line_role,
        l.client_visible,
        l.client_removable,
        l.client_changeable,
        l.is_default,
        l.is_optional,
        l.is_extra_billable,
        l.extra_price,
        i.name AS item_name,
        i.brand AS item_brand,
        u.code AS unit_code
       FROM recipes r
       JOIN recipe_lines l ON l.recipe_id = r.id AND l.tenant_id = r.tenant_id
       JOIN items i ON i.id = l.item_id AND i.tenant_id = r.tenant_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE r.tenant_id = ?
         AND r.recipe_type = 'product'
         AND r.is_active = 1
       ORDER BY r.recipe_key ASC, l.sort_order ASC, l.id ASC`
    ).bind(tenantId).all();

    const products = {};
    for (const line of result.results || []) {
      const productId = productIdFromRecipeKey(line.recipe_key);
      if (!productId) continue;
      if (!products[productId]) {
        products[productId] = {
          removable: [],
          changeableDressings: [],
          defaultInternalDressings: [],
          extraBillables: [],
          optionGroups: [],
        };
      }

      const item = {
        name: line.item_name,
        brand: line.item_brand || '',
        quantity: Number(line.quantity || 0),
        unit: line.unit_code || '',
        role: line.line_role || 'ingrediente',
        // CORREGIDO: "|| 10" convertia un precio explicito de $0 en $10 --
        // la columna extra_price es NOT NULL DEFAULT 0, asi que confiar
        // en el valor real de la DB es siempre correcto aqui.
        extraPrice: Number(line.extra_price ?? 0),
      };

      if (Number(line.client_visible || 0) === 1 && Number(line.client_removable || 0) === 1) {
        pushUnique(products[productId].removable, item);
      }

      if (isDressingLine(line) && Number(line.is_default || 0) === 1) {
        pushUnique(products[productId].defaultInternalDressings, item);
      }

      if (isDressingLine(line) && (Number(line.client_changeable || 0) === 1 || Number(line.is_optional || 0) === 1)) {
        pushUnique(products[productId].changeableDressings, item);
      }

      const isExtraBillable = Number(line.is_extra_billable || 0) === 1;
      const isVisibleOption = Number(line.client_visible || 0) === 1 || Number(line.is_optional || 0) === 1;
      if (isExtraBillable && isVisibleOption && Number(line.quantity || 0) > 0) {
        pushUnique(products[productId].extraBillables, item);
      }
    }


    const groupResult = await env.DB.prepare(
      `SELECT pg.*, f.family_key, f.name AS family_name,
        oi.id AS option_item_id, oi.option_name, oi.quantity, oi.extra_price AS option_extra_price, oi.is_default AS option_default,
        i.name AS item_name, i.brand AS item_brand, u.code AS unit_code
       FROM stock_product_option_groups pg
       JOIN stock_option_families f ON f.id = pg.family_id AND f.tenant_id = pg.tenant_id
       JOIN stock_option_family_items oi ON oi.family_id = f.id AND oi.tenant_id = pg.tenant_id AND oi.is_active = 1
       JOIN items i ON i.id = oi.item_id AND i.tenant_id = pg.tenant_id
       LEFT JOIN stock_units u ON u.id = i.unit_id
       WHERE pg.tenant_id = ? AND pg.is_active = 1 AND f.is_active = 1
       ORDER BY pg.product_id ASC, pg.sort_order ASC, oi.sort_order ASC, oi.id ASC`
    ).bind(tenantId).all();

    let componentRows = [];
    try {
      componentRows = (await env.DB.prepare(
        `SELECT c.option_item_id, c.quantity, i.name AS item_name, u.code AS unit_code
         FROM stock_option_family_item_components c
         JOIN items i ON i.id = c.item_id AND i.tenant_id = c.tenant_id
         LEFT JOIN stock_units u ON u.id = i.unit_id
         WHERE c.tenant_id = ?
         ORDER BY c.option_item_id ASC, c.sort_order ASC, c.id ASC`
      ).bind(tenantId).all()).results || [];
    } catch { componentRows = []; }
    const componentsByOption = new Map();
    for (const component of componentRows) {
      if (!componentsByOption.has(component.option_item_id)) componentsByOption.set(component.option_item_id, []);
      componentsByOption.get(component.option_item_id).push({ name: component.item_name, quantity: Number(component.quantity || 0), unit: component.unit_code || '' });
    }

    const groupMap = new Map();
    for (const row of groupResult.results || []) {
      const productId = row.product_id;
      if (!products[productId]) products[productId] = { removable: [], changeableDressings: [], defaultInternalDressings: [], extraBillables: [], optionGroups: [] };
      const key = `${productId}:${row.family_key}`;
      if (!groupMap.has(key)) {
        const group = {
          familyKey: row.family_key,
          label: row.label || row.family_name,
          minSelect: Number(row.min_select || 0),
          maxIncluded: Number(row.max_included || 0),
          maxTotal: Number(row.max_total || 1),
          defaultOptionName: row.default_option_name || '',
          extraPrice: Number(row.extra_price || 0),
          required: Number(row.is_required || 0) === 1,
          options: [],
        };
        groupMap.set(key, group);
        products[productId].optionGroups.push(group);
      }
      const group = groupMap.get(key);
      group.options.push({
        name: row.option_name || row.item_name,
        itemName: row.item_name,
        brand: row.item_brand || '',
        quantity: Number(row.quantity || 0),
        unit: row.unit_code || '',
        extraPrice: Number(row.option_extra_price || row.extra_price || 0),
        isDefault: Number(row.option_default || 0) === 1 || (row.default_option_name && String(row.default_option_name).toLowerCase() === String(row.option_name || '').toLowerCase()),
        components: componentsByOption.get(row.option_item_id) || [],
      });
    }

    return jsonResponse({ ok: true, products });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar personalizaciones.', detail: error.message }, 500);
  }
}

