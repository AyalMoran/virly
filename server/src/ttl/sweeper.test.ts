// src/ttl/sweeper.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { sweepExpired } from "./sweeper.js";
import { aiConversations, aiPendingTransfers, verificationTokens } from "../repositories/postgres/schema.js";
import type { PgDatabase } from "../db/postgres.js";

test("sweepExpired deletes expired ai_conversations then ai_pending_transfers (expires_at < now)", async () => {
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

  assert.equal(calls.length, 3);
  // FK-irrelevant here, but the order is deterministic: conversations then pending transfers then verification tokens.
  assert.equal(calls[0].table, aiConversations);
  assert.equal(calls[1].table, aiPendingTransfers);
  assert.equal(calls[2].table, verificationTokens);
  // Each delete is constrained by a where clause (expires_at < now).
  assert.ok(calls[0].cond != null);
  assert.ok(calls[1].cond != null);
  assert.ok(calls[2].cond != null);
});
