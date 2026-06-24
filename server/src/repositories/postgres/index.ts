

import type { Repositories } from "../types.js";
import { runInTransaction } from "./transaction.js";
import type { PgDatabase } from "../../db/postgres.js";
import { postgresUserRepository } from "./user.repository.js";
import { postgresTransactionRepository } from "./transaction.repository.js";
import { postgresPersonalDetailsRepository } from "./personalDetails.repository.js";
import { postgresExchangeRateRepository } from "./exchangeRate.repository.js";
import { postgresAiConversationRepository } from "./aiConversation.repository.js";
import { postgresAiPendingTransferRepository } from "./aiPendingTransfer.repository.js";
import { postgresAiAuditLogRepository } from "./aiAuditLog.repository.js";

// Stub — Task 5+ fill in the real per-entity repos.
export function createPostgresRepositories(_db?: PgDatabase): Repositories {
  return {
    users: postgresUserRepository,
    transactions: postgresTransactionRepository,
    personalDetails: postgresPersonalDetailsRepository,
    exchangeRates: postgresExchangeRateRepository,
    aiConversations: postgresAiConversationRepository,
    aiPendingTransfers: postgresAiPendingTransferRepository,
    aiAuditLogs: postgresAiAuditLogRepository,
    videoSessions: {} as Repositories["videoSessions"],
    videoAuditLogs: {} as Repositories["videoAuditLogs"],
    runInTransaction
  };
}
