-- The developer list. 0015 granted developer_access once, to accounts that
-- existed and were verified at the time, so anyone on the list who signed up
-- or verified later never got the gold ring, tag or Developer plan. Keeping the
-- list in a table lets triggers grant access whenever a listed email is
-- verified, whichever sign-in route creates or verifies the account.
-- To add someone: INSERT INTO developer_emails (email) VALUES ('name@example.com');
-- in a new migration, plus the UPDATE below for an account that already exists.
CREATE TABLE developer_emails (
  email text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
INSERT INTO developer_emails (email) VALUES
  ('abtinfeizollahi67@gmail.com'),
  ('prahm010@gmail.com'),
  ('prahm012@gmail.com'),
  ('josh.tarr10@gmail.com');
--> statement-breakpoint
UPDATE users
SET developer_access = 1
WHERE email_verified = 1
  AND lower(email) IN (SELECT email FROM developer_emails);
--> statement-breakpoint
-- Apple and Google sign-ups insert an already-verified user.
CREATE TRIGGER developer_access_on_insert
AFTER INSERT ON users
WHEN NEW.email_verified = 1
  AND NEW.developer_access = 0
  AND lower(NEW.email) IN (SELECT email FROM developer_emails)
BEGIN
  UPDATE users SET developer_access = 1 WHERE id = NEW.id;
END;
--> statement-breakpoint
-- Email links and social sign-in verify an existing user.
CREATE TRIGGER developer_access_on_verify
AFTER UPDATE OF email_verified, email ON users
WHEN NEW.email_verified = 1
  AND NEW.developer_access = 0
  AND lower(NEW.email) IN (SELECT email FROM developer_emails)
BEGIN
  UPDATE users SET developer_access = 1 WHERE id = NEW.id;
END;
