-- Kept separate from billing so Stripe webhooks cannot revoke test access.
ALTER TABLE users ADD COLUMN developer_access integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE users
SET developer_access = 1
WHERE lower(email) IN (
  'abtinfeizollahi67@gmail.com',
  'prahm010@gmail.com',
  'prahm012@gmail.com'
)
  AND email_verified = 1;
