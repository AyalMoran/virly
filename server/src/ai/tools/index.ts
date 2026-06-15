import { AssistantToolExecutors } from "../state.js";
import { getAccountBalance } from "./getAccountBalance.js";
import { getCounterpartyActivityTimeline } from "./getCounterpartyActivityTimeline.js";
import { getCounterpartySummary } from "./getCounterpartySummary.js";
import { getLastSentCounterparty } from "./getLastSentCounterparty.js";
import { getNetWithCounterparty } from "./getNetWithCounterparty.js";
import { getDailyTransferUsage } from "./getDailyTransferUsage.js";
import { getPendingAiTransfers } from "./getPendingAiTransfers.js";
import { getRecentReceivedCounterparties } from "./getRecentReceivedCounterparties.js";
import { getRecentSentCounterparties } from "./getRecentSentCounterparties.js";
import { getRecentTransactions } from "./getRecentTransactions.js";
import { getTransactionReceipt } from "./getTransactionReceipt.js";
import { getTransactionStats } from "./getTransactionStats.js";
import { getTotalReceivedFromCounterparty } from "./getTotalReceivedFromCounterparty.js";
import { getTotalSentToCounterparty } from "./getTotalSentToCounterparty.js";
import { getTransferEligibility } from "./getTransferEligibility.js";
import { getTransferLimits } from "./getTransferLimits.js";
import { getTransferQuote } from "./getTransferQuote.js";
import { getTransactionsWithCounterparty } from "./getTransactionsWithCounterparty.js";
import { getUserAccounts } from "./getUserAccounts.js";
import { getVerifiedRecipients } from "./getVerifiedRecipients.js";
import { resolveCounterpartyCandidates } from "./resolveCounterpartyCandidates.js";
import { resolvePendingTransferReference } from "./resolvePendingTransferReference.js";
import { resolveTransactionReference } from "./resolveTransactionReference.js";
import { searchTransactions } from "./searchTransactions.js";

export const readOnlyToolExecutors: AssistantToolExecutors = {
  getUserAccounts,
  getAccountBalance,
  getRecentTransactions,
  getLastSentCounterparty,
  getTransactionsWithCounterparty,
  getTotalSentToCounterparty,
  getTotalReceivedFromCounterparty,
  getNetWithCounterparty,
  getVerifiedRecipients,
  getTransferLimits,
  getRecentSentCounterparties,
  getRecentReceivedCounterparties,
  resolveCounterpartyCandidates,
  getCounterpartySummary,
  getCounterpartyActivityTimeline,
  searchTransactions,
  getTransactionStats,
  resolveTransactionReference,
  getTransactionReceipt,
  getTransferEligibility,
  getTransferQuote,
  getDailyTransferUsage,
  getPendingAiTransfers,
  resolvePendingTransferReference
};
