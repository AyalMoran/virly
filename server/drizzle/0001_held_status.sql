ALTER TABLE "ai_pending_transfers" DROP CONSTRAINT IF EXISTS "ai_pending_status_ck";--> statement-breakpoint
ALTER TABLE "ai_pending_transfers" ADD CONSTRAINT "ai_pending_status_ck" CHECK ("ai_pending_transfers"."status" in ('pending','confirmed','denied','expired','superseded','held'));
