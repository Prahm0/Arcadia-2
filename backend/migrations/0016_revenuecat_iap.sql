-- RevenueCat is the server-verified source of truth for subscriptions bought
-- through the iOS App Store. Stripe identifiers remain untouched for web
-- subscriptions so one provider cannot overwrite the other by accident.
ALTER TABLE users ADD COLUMN billing_provider TEXT;
ALTER TABLE users ADD COLUMN revenuecat_app_user_id TEXT;
ALTER TABLE users ADD COLUMN revenuecat_entitlement TEXT;
ALTER TABLE users ADD COLUMN revenuecat_product_id TEXT;

CREATE INDEX users_revenuecat_app_user_idx ON users (revenuecat_app_user_id);
