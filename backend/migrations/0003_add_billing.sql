-- Stripe subscription tracking on users. Everyone starts on `free`; the
-- webhook flips this to `pro` / `max` once a Checkout completes and the
-- subscription becomes active. `subscription_current_period_end` is the
-- authoritative cutoff we compare against on tier lookups so a cancelled
-- subscription keeps access until the paid period actually elapses.
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT;
ALTER TABLE users ADD COLUMN subscription_current_period_end INTEGER;

CREATE INDEX users_stripe_customer_idx ON users (stripe_customer_id);

-- One row per user per calendar day (UTC), incremented every time a user
-- sends a message to Arcad. Free = 2/day, Pro = 20/day, Max = 100/day; the
-- row is created lazily on first send and pruned via ordinary retention.
CREATE TABLE arcad_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
