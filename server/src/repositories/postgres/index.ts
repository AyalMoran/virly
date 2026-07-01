

import type { Repositories } from "../types.js";
import { runInTransaction } from "./transaction.js";
import type { PgDatabase } from "../../db/postgres.js";
import { postgresUserRepository } from "./user.repository.js";
import { postgresTransactionRepository } from "./transaction.repository.js";
import { postgresPersonalDetailsRepository } from "./personalDetails.repository.js";
import { postgresCommunicationProfileRepository } from "./communicationProfile.repository.js";
import { postgresExchangeRateRepository } from "./exchangeRate.repository.js";
import { postgresAiConversationRepository } from "./aiConversation.repository.js";
import { postgresAiPendingTransferRepository } from "./aiPendingTransfer.repository.js";
import { postgresAiAuditLogRepository } from "./aiAuditLog.repository.js";
import { postgresVideoSessionRepository } from "./videoSession.repository.js";
import { postgresVideoAuditLogRepository } from "./videoAuditLog.repository.js";
import { postgresVerificationTokenRepository } from "./verificationToken.repository.js";

/** Build the full Postgres-backed {@link Repositories} (all 10 entities). */
export function createPostgresRepositories(_db?: PgDatabase): Repositories {
  return {
    users: postgresUserRepository,
    transactions: postgresTransactionRepository,
    personalDetails: postgresPersonalDetailsRepository,
    communicationProfile: postgresCommunicationProfileRepository,
    exchangeRates: postgresExchangeRateRepository,
    aiConversations: postgresAiConversationRepository,
    aiPendingTransfers: postgresAiPendingTransferRepository,
    aiAuditLogs: postgresAiAuditLogRepository,
    videoSessions: postgresVideoSessionRepository,
    videoAuditLogs: postgresVideoAuditLogRepository,
    verificationTokens: postgresVerificationTokenRepository,
    runInTransaction
  };
}
