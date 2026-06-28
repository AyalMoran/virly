
// src/repositories/postgres/schema.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import * as schema from "../schema.js";

test("schema exports the 9 Phase-1 tables", () => {
  for (const name of [
    "users", "transactions", "personalDetails", "exchangeRates",
    "aiConversations", "aiPendingTransfers", "aiAuditLogs",
    "videoSessions", "videoAuditLogs"
  ]) {
    assert.ok((schema as Record<string, unknown>)[name], `missing table: ${name}`);
  }
});
