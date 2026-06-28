-- Run BEFORE applying the verification-token column-drop migration.
-- Copies inline users.verification_token_hash rows into verification_tokens. Idempotent.
INSERT INTO verification_tokens (id, user_id, token_hash, expires_at, created_at, updated_at)
SELECT
  substr(md5(random()::text || clock_timestamp()::text || u.id), 1, 24),
  u.id,
  u.verification_token_hash,
  COALESCE(u.verification_token_expires_at, now() + interval '24 hours'),
  now(),
  now()
FROM users u
WHERE u.verification_token_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
