-- El administrador confirmó que las tres promociones de Pecas deben mostrarse.
UPDATE app_settings
SET value_json = json_set(value_json, '$.promotions[2].active', json('true')),
    updated_at = CURRENT_TIMESTAMP
WHERE key = (SELECT id || ':menu_overrides' FROM saas_tenants WHERE slug = 'pecas')
  AND json_array_length(json_extract(value_json, '$.promotions')) >= 3;
