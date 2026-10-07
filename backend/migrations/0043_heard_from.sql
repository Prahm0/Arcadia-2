-- Onboarding's "How did you hear about Arcadia?". heard_from is one of a
-- fixed set (tiktok, instagram, youtube, creator, friend, app_store, google,
-- school, other); heard_from_detail is the creator's handle or the student's
-- own words for "other". Both null for accounts made before the question.
ALTER TABLE profiles ADD COLUMN heard_from TEXT;
ALTER TABLE profiles ADD COLUMN heard_from_detail TEXT;
