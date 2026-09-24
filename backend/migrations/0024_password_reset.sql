ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires_at INTEGER;
ALTER TABLE users ADD COLUMN password_reset_requested_at INTEGER;
