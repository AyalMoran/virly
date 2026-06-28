// src/ttl/sweeper.test.ts
import { sweepExpired } from "../sweeper.js";
import { aiConversations, aiPendingTransfers, verificationTokens } from "../../repositories/postgres/schema.js";
import type { PgDatabase } from "../../db/postgres.js";

test("sweepExpired deletes expired ai_conversations then ai_pending_transfers then verification_tokens (expires_at < now)", async () => {
  const calls: Array<{ table: unknown; cond: unknown }> = [];
  const fakeDb = {
    delete(table: unknown) {
      return {
        where(cond: unknown) {
          calls.push({ table, cond });
          return Promise.resolve();
        }
      };
    }
  } as unknown as PgDatabase;

  const now = new Date("2024-01-01T00:00:00.000Z");
  await sweepExpired(fakeDb, now);

  expect(calls.length).toBe(3);
  // FK-irrelevant here, but the order is deterministic: conversations then pending transfers then verification tokens.
  expect(calls[0].table).toBe(aiConversations);
  expect(calls[1].table).toBe(aiPendingTransfers);
  expect(calls[2].table).toBe(verificationTokens);
  // Each delete is constrained by a where clause (expires_at < now).
  expect(calls[0].cond).not.toBeNull();
  expect(calls[1].cond).not.toBeNull();
  expect(calls[2].cond).not.toBeNull();
});
