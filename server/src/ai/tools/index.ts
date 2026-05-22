import { AssistantToolExecutors } from "../state.js";
import { getAccountBalance } from "./getAccountBalance.js";
import { getLastSentCounterparty } from "./getLastSentCounterparty.js";
import { getRecentTransactions } from "./getRecentTransactions.js";
import { getTotalSentToCounterparty } from "./getTotalSentToCounterparty.js";
import { getTransferLimits } from "./getTransferLimits.js";
import { getTransactionsWithCounterparty } from "./getTransactionsWithCounterparty.js";
import { getUserAccounts } from "./getUserAccounts.js";
import { getVerifiedRecipients } from "./getVerifiedRecipients.js";

export const readOnlyToolExecutors: AssistantToolExecutors = {
  getUserAccounts,
  getAccountBalance,
  getRecentTransactions,
  getLastSentCounterparty,
  getTransactionsWithCounterparty,
  getTotalSentToCounterparty,
  getVerifiedRecipients,
  getTransferLimits
};
