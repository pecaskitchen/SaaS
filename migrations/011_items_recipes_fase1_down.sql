-- Reversion de 011_items_recipes_fase1.sql -- solo revierte los renames de
-- tabla (lo que el codigo viejo necesita para volver a funcionar). Las
-- columnas nuevas (items.type, recipes.item_id, etc.) y las tablas nuevas
-- (families, unit_conversions) se dejan tal cual: son aditivas y el codigo
-- viejo nunca las referencia, asi que no rompen nada si se quedan.

ALTER TABLE items RENAME TO inventory_items;
ALTER TABLE recipes RENAME TO stock_recipes;
ALTER TABLE recipe_lines RENAME TO stock_recipe_lines;
