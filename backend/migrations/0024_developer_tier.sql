-- Developer access keeps its Max default but may select a different test tier.
-- This is separate from the subscription tier so billing webhooks cannot overwrite it.
ALTER TABLE users ADD COLUMN developer_tier text;
