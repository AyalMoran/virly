import { getRepositories } from "../repositories/index.js";
import type { TransactionRecord } from "../repositories/types.js";

// Re-export TransactionRecord as TransactionDocument for backward-compat with
// consumers that import this type from this module (routes, ai/tools, etc.).
// They will be migrated in Task 6b; keeping the alias avoids breakage now.
export type TransactionDocument = TransactionRecord;

export const transactionQueryService = {
  /**
   * Paginated list of ledger entries owned by `ownerId`, optionally filtered
   * by a single counterparty email. The caller is responsible for parsing and
   * validating `page` and `limit` before calling this method.
   */
  async listForOwner(input: {
    ownerId: string;
    counterpartyEmail?: string;
    page: number;
    limit: number;
  }): Promise<{ transactions: TransactionRecord[]; total: number }> {
    return getRepositories().transactions.listForOwner(input);
  },

  /**
   * Aggregated relationship statistics between `ownerId` and a counterparty.
   */
  async getRelationshipStats(input: {
    ownerId: string;
    counterpartyEmail: string;
  }): Promise<{
    totalSent: number;
    totalReceived: number;
    transactionCount: number;
    lastTransactionAt: Date | null;
  }> {
    return getRepositories().transactions.getRelationshipStats(input);
  },

  /**
   * Most-recent transactions between `ownerId` and a counterparty, sorted
   * descending by creation time. No pagination — callers supply an explicit
   * `limit`.
   */
  async recentWithCounterparty(input: {
    ownerId: string;
    counterpartyEmail: string;
    limit: number;
  }): Promise<TransactionRecord[]> {
    return getRepositories().transactions.recentWithCounterparty(input);
  }
};
