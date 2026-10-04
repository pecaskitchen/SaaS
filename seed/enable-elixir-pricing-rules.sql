INSERT INTO app_settings (key, tenant_id, value_json, updated_at)
VALUES (
  'biz_elixir_parfum_mty:menu_overrides',
  'biz_elixir_parfum_mty',
  '{"pricingRules":{"enabled":true,"rules":[{"id":"30ml-2x120","variantId":"30-ml","minQuantity":2,"maxQuantity":9,"bundleQuantity":2,"bundlePrice":120,"label":"2 por $120"},{"id":"30ml-10","variantId":"30-ml","minQuantity":10,"maxQuantity":19,"unitPrice":55,"label":"Desde 10 piezas: $55 c/u"},{"id":"30ml-20","variantId":"30-ml","minQuantity":20,"unitPrice":50,"label":"Desde 20 piezas: $50 c/u"},{"id":"60ml-10","variantId":"60-ml","minQuantity":10,"maxQuantity":19,"unitPrice":110,"label":"Desde 10 piezas: $110 c/u"},{"id":"60ml-20","variantId":"60-ml","minQuantity":20,"unitPrice":100,"label":"Desde 20 piezas: $100 c/u"}]}}',
  datetime('now')
)
ON CONFLICT(key) DO UPDATE SET
  value_json = json_set(value_json, '$.pricingRules', json('{"enabled":true,"rules":[{"id":"30ml-2x120","variantId":"30-ml","minQuantity":2,"maxQuantity":9,"bundleQuantity":2,"bundlePrice":120,"label":"2 por $120"},{"id":"30ml-10","variantId":"30-ml","minQuantity":10,"maxQuantity":19,"unitPrice":55,"label":"Desde 10 piezas: $55 c/u"},{"id":"30ml-20","variantId":"30-ml","minQuantity":20,"unitPrice":50,"label":"Desde 20 piezas: $50 c/u"},{"id":"60ml-10","variantId":"60-ml","minQuantity":10,"maxQuantity":19,"unitPrice":110,"label":"Desde 10 piezas: $110 c/u"},{"id":"60ml-20","variantId":"60-ml","minQuantity":20,"unitPrice":100,"label":"Desde 20 piezas: $100 c/u"}]}')),
  updated_at = datetime('now');
