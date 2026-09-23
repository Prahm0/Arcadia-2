-- Arcadia isn't Australia-only any more: students pick a country (ISO
-- 3166 alpha-2, e.g. "AU", "NZ", "GB"). `state` stays, but only means
-- something for Australia, where it picks the school term dates.
ALTER TABLE profiles ADD COLUMN country TEXT;
--> statement-breakpoint
UPDATE profiles SET country = 'AU' WHERE state IS NOT NULL;
