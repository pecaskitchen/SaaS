-- Registra la invitación a Pecas Club como promoción editable del tenant.
-- Después puede modificarse, desactivarse o eliminarse desde Menú > Promociones.
INSERT OR IGNORE INTO app_settings (key, tenant_id, value_json, updated_at)
SELECT
  id || ':menu_overrides',
  id,
  json_object('promotions', json_array(json_object(
    'id', 'pecas-club',
    'active', json('true'),
    'isDefault', json('true'),
    'title', '',
    'description', '',
    'disclaimer', '',
    'includedDetails', '',
    'items', json_array(),
    'price', 0,
    'image', '/tenants/pecas/promotions/unete-pecas-club.png',
    'linkUrl', '/club/registro',
    'linkLabel', 'Regístrate gratis en Pecas Club'
  ))),
  CURRENT_TIMESTAMP
FROM saas_tenants
WHERE slug = 'pecas';

UPDATE app_settings
SET value_json = CASE
      WHEN EXISTS (
        SELECT 1
        FROM json_each(CASE WHEN json_type(value_json, '$.promotions') = 'array' THEN json_extract(value_json, '$.promotions') ELSE json_array() END)
        WHERE json_extract(value, '$.id') = 'pecas-club'
      ) THEN value_json
      WHEN json_type(value_json, '$.promotions') = 'array' THEN json_insert(
        value_json,
        '$.promotions[#]',
        json_object(
          'id', 'pecas-club', 'active', json('true'), 'isDefault', json('true'),
          'title', '', 'description', '', 'disclaimer', '', 'includedDetails', '',
          'items', json_array(), 'price', 0,
          'image', '/tenants/pecas/promotions/unete-pecas-club.png',
          'linkUrl', '/club/registro', 'linkLabel', 'Regístrate gratis en Pecas Club'
        )
      )
      ELSE json_set(
        value_json,
        '$.promotions',
        json_array(json_object(
          'id', 'pecas-club', 'active', json('true'), 'isDefault', json('true'),
          'title', '', 'description', '', 'disclaimer', '', 'includedDetails', '',
          'items', json_array(), 'price', 0,
          'image', '/tenants/pecas/promotions/unete-pecas-club.png',
          'linkUrl', '/club/registro', 'linkLabel', 'Regístrate gratis en Pecas Club'
        ))
      )
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE key = (SELECT id || ':menu_overrides' FROM saas_tenants WHERE slug = 'pecas');

INSERT OR IGNORE INTO app_settings (key, tenant_id, value_json, updated_at)
SELECT
  id || ':menu_overrides:pecas_club_promotion_seeded_v1',
  id,
  '{"seeded":true}',
  CURRENT_TIMESTAMP
FROM saas_tenants
WHERE slug = 'pecas';
