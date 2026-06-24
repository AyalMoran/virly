

import type { Repositories } from "../types.js";
import { runInTransaction } from "./transaction.js";
import type { PgDatabase } from "../../db/postgres.js";
import { postgresUserRepository } from "./user.repository.js";
import { postgresTransactionRepository } from "./transaction.repository.js";
import { postgresPersonalDetailsRepository } from "./personalDetails.repository.js";
import { postgresExchangeRateRepository } from "./exchangeRate.repository.js";

// Stub — Task 5+ fill in the real per-entity repos.
export function createPostgresRepositories(_db?: PgDatabase): Repositories {
  return {
    users: postgresUserRepository,
    transactions: postgresTransactionRepository,
    personalDetails: postgresPersonalDetailsRepository,
    exchangeRates: postgresExchangeRateRepository,
    aiConversations: {} as Repositories["aiConversations"],
    aiPendingTransfers: {} as Repositories["aiPendingTransfers"],
    aiAuditLogs: {} as Repositories["aiAuditLogs"],
    videoSessions: {} as Repositories["videoSessions"],
    videoAuditLogs: {} as Repositories["videoAuditLogs"],
    runInTransaction
  };
}
