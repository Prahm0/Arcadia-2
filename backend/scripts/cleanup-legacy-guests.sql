-- REVIEW ONLY. Do not run on the remote database until the owner approves.
-- Run the SELECT statements first against a backup. Inspect R2 objects under each
-- user_id/ prefix and delete them separately before running the DELETE statement.
-- D1 foreign keys cascade through account records; R2 objects do not.
SELECT id, email FROM users WHERE email LIKE '%@arcadia.local' ORDER BY id;
SELECT uploads.user_id, uploads.key FROM uploads
  JOIN users ON users.id = uploads.user_id
  WHERE users.email LIKE '%@arcadia.local'
  ORDER BY uploads.user_id, uploads.key;
-- After reviewing the rows and deleting every corresponding R2 prefix,
-- uncomment this statement in a separate execution:
-- DELETE FROM users WHERE email LIKE '%@arcadia.local';
