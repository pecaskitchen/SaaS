-- Fase 1 del rediseno de productos/recetas/ingredientes/subrecetas/familias
-- (motor de costeo). Corte directo: renombra las tablas actuales en vez de
-- crear un sistema paralelo -- los ids y FKs existentes se preservan porque
-- ALTER TABLE RENAME TO es una operacion de metadata en SQLite/D1, no
-- reescribe filas.
--
--   inventory_items    -> items
--   stock_recipes      -> recipes
--   stock_recipe_lines -> recipe_lines
--
-- El resto de las tablas de stock (inventory_branch_stock, stock_movements,
-- waste_requests, inventory_count_requests, las 4 tablas de
-- opciones/familias de personalizacion del cliente, stock_units,
-- stock_suppliers, stock_purchase_categories) y las de catalogo
-- (menu_products, menu_categories) mantienen su nombre -- sus columnas
-- item_id/output_item_id/recipe_id siguen apuntando correctamente porque
-- SQLite preserva los rowids en un RENAME TO.
--
-- El backfill de items.type=product / menu_products.item_id / recipes.item_id
-- (para recetas de producto) se hace aparte, como accion admin idempotente
-- desde la UI (no en este archivo), porque necesita generar un item nuevo
-- por cada producto del catalogo -- ver Checkpoint 3 del plan.

ALTER TABLE inventory_items RENAME TO items;
ALTER TABLE stock_recipes RENAME TO recipes;
ALTER TABLE stock_recipe_lines RENAME TO recipe_lines;

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_families_tenant_name ON families(tenant_id, name);

-- Estructural para Fase 2 (presentaciones de compra reales) -- no se usa
-- todavia en el costeo/consumo de Fase 1 porque hoy no existe ningun caso
-- real de mezcla de unidades (cada item se trackea en una sola unidad base).
CREATE TABLE IF NOT EXISTS unit_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  item_id INTEGER,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor REAL NOT NULL
);

ALTER TABLE items ADD COLUMN type TEXT;
ALTER TABLE items ADD COLUMN family_id INTEGER;
ALTER TABLE items ADD COLUMN sku TEXT;
ALTER TABLE items ADD COLUMN is_sellable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN is_purchasable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN is_producible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN is_modifier INTEGER NOT NULL DEFAULT 0;

ALTER TABLE recipes ADD COLUMN item_id INTEGER;
ALTER TABLE recipes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE recipes ADD COLUMN waste_percent REAL NOT NULL DEFAULT 0;

ALTER TABLE recipe_lines ADD COLUMN notes TEXT;
ALTER TABLE recipe_lines ADD COLUMN waste_percent REAL NOT NULL DEFAULT 0;

-- FK real nueva hacia items (type='product') -- reemplaza el matching por
-- recipe_key/nombre. Se rellena para productos existentes en el backfill
-- admin del Checkpoint 3; para productos nuevos/editados de aqui en
-- adelante, menuCatalog.js's saveCatalogTables la rellena directamente.
ALTER TABLE menu_products ADD COLUMN item_id INTEGER;

-- Backfill de items.type a partir de las senales que ya existen hoy.
-- Orden importa: subrecipe primero (output_item_id de una receta activa
-- tipo subrecipe), luego packaging/modifier por flags existentes, el resto
-- queda como ingredient (el default operativo real de hoy).
UPDATE items SET type = 'subrecipe'
WHERE id IN (SELECT output_item_id FROM recipes WHERE recipe_type = 'subrecipe' AND output_item_id IS NOT NULL);

UPDATE items SET type = 'packaging' WHERE type IS NULL AND is_packaging = 1;
UPDATE items SET type = 'modifier' WHERE type IS NULL AND is_sellable_extra = 1 AND deducts_inventory = 0;
UPDATE items SET type = 'ingredient' WHERE type IS NULL;

UPDATE items SET is_producible = 1 WHERE type = 'subrecipe';

-- recipes.item_id para subrecetas ya se puede resolver aqui mismo (ya
-- tienen output_item_id). El lado de productos (recipes.item_id via
-- menu_products.item_id) se resuelve en el backfill admin del Checkpoint 3,
-- porque primero hay que crear los items tipo product que hoy no existen.
UPDATE recipes SET item_id = output_item_id
WHERE recipe_type = 'subrecipe' AND item_id IS NULL AND output_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_tenant_type ON items(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_recipes_item ON recipes(item_id);
