ALTER TABLE club_rewards ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'product';
ALTER TABLE club_rewards ADD COLUMN eligible_product_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE club_rewards ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE club_redemptions ADD COLUMN order_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_club_redemptions_order ON club_redemptions (tenant_id, order_id);

UPDATE club_rewards SET eligible_product_ids_json = COALESCE((SELECT json_group_array(product_key) FROM menu_products WHERE tenant_id = club_rewards.tenant_id AND is_active = 1 AND lower(name) LIKE '%latte%'), '[]') WHERE id = 'pecas_reward_latte';
UPDATE club_rewards SET eligible_product_ids_json = COALESCE((SELECT json_group_array(product_key) FROM menu_products WHERE tenant_id = club_rewards.tenant_id AND is_active = 1 AND (lower(name) LIKE '%crepa%' OR lower(category_key) LIKE '%crepa%')), '[]') WHERE id = 'pecas_reward_crepa';
UPDATE club_rewards SET eligible_product_ids_json = COALESCE((SELECT json_group_array(product_key) FROM menu_products WHERE tenant_id = club_rewards.tenant_id AND is_active = 1 AND (lower(name) LIKE '%panini%' OR lower(category_key) LIKE '%panini%')), '[]') WHERE id = 'pecas_reward_panini';
UPDATE club_rewards SET reward_type = 'fixed_discount', discount_amount = 150 WHERE id = 'pecas_reward_150';
