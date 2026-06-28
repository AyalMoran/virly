-- Backfill the inline users verification-token columns into verification_tokens BEFORE
-- dropping them. Folding the copy and the drop into one migration makes the copy
-- ordered-before and atomic with the destructive drop: drizzle runs a migration's
-- statements in a transaction, so a backfill failure rolls the drop back, and the drop
-- can never run ahead of the copy. Idempotent (ON CONFLICT); a no-op on a fresh database.
--
-- id: a fresh 24-hex value (matches the app's ObjectId-shaped char(24) ids) from the
--   built-in gen_random_uuid() CSPRNG -- no pgcrypto extension needed (Postgres 13+).
-- expires_at: legacy rows that have a token hash but no stored expiry default to now + 24h.
--   This is intentional and harmless: verifyEmail gates on the verification JWT's own
--   10-minute expiry first, so a synthetic DB expiry can never revive a dead link.
INSERT INTO "verification_tokens" ("id", "user_id", "token_hash", "expires_at", "created_at", "updated_at")
SELECT
  left(replace(gen_random_uuid()::text, '-', ''), 24),
  u."id",
  u."verification_token_hash",
  COALESCE(u."verification_token_expires_at", now() + interval '24 hours'),
  now(),
  now()
FROM "users" u
WHERE u."verification_token_hash" IS NOT NULL
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "verification_token_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "verification_token_expires_at";