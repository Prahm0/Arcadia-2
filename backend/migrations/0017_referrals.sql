-- Referral rewards are temporary Pro entitlement, independent of Stripe and
-- App Store subscriptions. NULL referral codes leave existing users untouched
-- until their first visit to the invite page assigns a stable code.
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by_user_id TEXT;
ALTER TABLE users ADD COLUMN pro_bonus_until INTEGER;
ALTER TABLE users ADD COLUMN pro_bonus_days_earned INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX users_referral_code_idx ON users (referral_code);

CREATE TABLE referrals (
  id TEXT PRIMARY KEY NOT NULL,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  qualified_at INTEGER
);

CREATE UNIQUE INDEX referrals_invitee_idx ON referrals (invitee_user_id);
CREATE INDEX referrals_referrer_qualified_idx ON referrals (referrer_user_id, qualified_at);
