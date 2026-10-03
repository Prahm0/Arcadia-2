-- Whether the student allowed Arcadia to send their study details to
-- OpenAI (App Store guideline 5.1.2). Null until they've been asked;
-- 'granted' or 'declined' after, with when they chose.
ALTER TABLE profiles ADD COLUMN ai_consent text;
ALTER TABLE profiles ADD COLUMN ai_consent_at integer;
