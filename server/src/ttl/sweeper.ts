// src/ttl/sweeper.ts
//
// Postgres has no native TTL, so this sweeper replaces the Mongo `expires`
// indexes on `ai_conversations`, `ai_pending_transfers`, and
// `verification_tokens` by periodically deleting rows whose `expires_at` has
// passed. Active-row queries already filter `expires_at > now()`, so the
// sweeper is purely about reclaiming space.
import { lt } from "drizzle-orm";
import { aiConversations, aiPendingTransfers, verificationTokens } from "../repositories/postgres/schema.js";
import { getPgDb, type PgDatabase } from "../db/postgres.js";

export async function sweepExpired(db: PgDatabase = getPgDb(), now: Date = new Date()): Promise<void> {
  await db.delete(aiConversations).where(lt(aiConversations.expiresAt, now));
  await db.delete(aiPendingTransfers).where(lt(aiPendingTransfers.expiresAt, now));
  await db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, now));
}

let timer: NodeJS.Timeout | null = null;

/** Start the periodic TTL sweep (no-op if already running). Unref'd so it never
 * keeps the process alive on its own. */
export function startTtlSweeper(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepExpired().catch((e) => console.error("ttl sweep failed", e));
  }, intervalMs);
  timer.unref();
}
