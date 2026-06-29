
// src/repositories/postgres/schema.test.ts
import * as schema from "../schema.js";

test("schema exports the 9 Phase-1 tables", () => {
  for (const name of [
    "users", "transactions", "personalDetails", "exchangeRates",
    "aiConversations", "aiPendingTransfers", "aiAuditLogs",
    "videoSessions", "videoAuditLogs"
  ]) {
    expect((schema as Record<string, unknown>)[name]).toBeTruthy();
  }
});
