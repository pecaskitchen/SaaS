ALTER TABLE club_redemptions ADD COLUMN expires_at_utc TEXT;
UPDATE club_redemptions SET expires_at_utc = datetime(redeemed_at_utc, '+6 months') WHERE expires_at_utc IS NULL;
CREATE INDEX IF NOT EXISTS idx_club_redemptions_expiry ON club_redemptions (tenant_id, status, expires_at_utc);
