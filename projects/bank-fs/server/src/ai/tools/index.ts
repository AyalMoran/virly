import { AssistantToolExecutors } from "../state.js";
import { getAccountBalance } from "./getAccountBalance.js";
import { getRecentTransactions } from "./getRecentTransactions.js";
import { getTransferLimits } from "./getTransferLimits.js";
import { getUserAccounts } from "./getUserAccounts.js";
import { getVerifiedRecipients } from "./getVerifiedRecipients.js";

export const readOnlyToolExecutors: AssistantToolExecutors = {
  getUserAccounts,
  getAccountBalance,
  getRecentTransactions,
  getVerifiedRecipients,
  getTransferLimits
};
