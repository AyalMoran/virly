/**
 * AI-assistant response-block fixtures. These are read-only / prepared-action
 * surfaces only: the assistant never appears to move money on its own — the
 * transfer_confirmation block is always presented for the user to confirm/deny.
 */
import type {
  AiChatResponse,
  AssistantResponseBlock,
  AssistantTransactionItem,
  PendingTransferItem,
} from "@/lib/types";
import { transferConfirmationFixture } from "./transfer";

const assistantTransactions: AssistantTransactionItem[] = [
  {
    id: "atx_0001",
    direction: "sent",
    counterpartyName: "Maya Cohen",
    counterpartyEmail: "maya.cohen@virly.test",
    amount: { amount: 250, currency: "ILS", formatted: "₪250.00" },
    status: "completed",
    createdAt: "2026-06-20T18:30:00.000Z",
    description: "Dinner split",
  },
  {
    id: "atx_0002",
    direction: "received",
    counterpartyName: "Acme Payroll",
    counterpartyEmail: "payroll@acme.test",
    amount: { amount: 1200, currency: "ILS", formatted: "₪1,200.00" },
    status: "completed",
    createdAt: "2026-06-19T08:00:00.000Z",
    description: "June salary",
  },
];

const assistantPendingTransfers: PendingTransferItem[] = [
  {
    id: "pt_0001",
    recipientLabel: "Maya Cohen (maya.cohen@virly.test)",
    recipientEmailMasked: "m***@virly.test",
    amount: { amount: 250, currency: "ILS", formatted: "₪250.00" },
    reason: "Dinner split",
    status: "pending",
    expiresAt: "2099-12-31T23:59:59.000Z",
    conversationId: "conv_test_0001",
  },
];

export const assistantTextBlock: AssistantResponseBlock = {
  id: "blk_text",
  type: "text",
  title: { text: "Here's what I found", dir: "ltr" },
  text: {
    text: "Your current balance is ₪1,250.00. You can send money or review recent activity from here.",
    dir: "ltr",
  },
};

export const assistantAccountSummaryBlock: AssistantResponseBlock = {
  id: "blk_account",
  type: "account_summary",
  title: { text: "Account summary", dir: "ltr" },
  accountLabel: { text: "Primary account", dir: "ltr" },
  availableBalance: { amount: 1250, currency: "ILS", formatted: "₪1,250.00" },
};

export const assistantTransactionListBlock: AssistantResponseBlock = {
  id: "blk_txn_list",
  type: "transaction_list",
  title: { text: "Recent transactions", dir: "ltr" },
  subtitle: { text: "Last 2 of 142", dir: "ltr" },
  transactions: assistantTransactions,
  summary: { totalCount: 142 },
};

export const assistantTransferConfirmationBlock: AssistantResponseBlock = {
  id: "blk_confirm",
  type: "transfer_confirmation",
  title: { text: "Please confirm this transfer", dir: "ltr" },
  confirmation: transferConfirmationFixture,
};

export const assistantPendingTransfersBlock: AssistantResponseBlock = {
  id: "blk_pending",
  type: "pending_transfers",
  title: { text: "Pending transfers awaiting your confirmation", dir: "ltr" },
  pendingTransfers: assistantPendingTransfers,
  summary: { totalCount: 1 },
};

export const assistantTransferQuoteBlock: AssistantResponseBlock = {
  id: "blk_quote",
  type: "transfer_quote",
  title: { text: "Transfer quote", dir: "ltr" },
  eligible: true,
  recipientLabel: "Maya Cohen",
  amount: { amount: 250, currency: "ILS", formatted: "₪250.00" },
  currentBalance: { amount: 1250, currency: "ILS", formatted: "₪1,250.00" },
  remainingBalanceAfterTransfer: {
    amount: 1000,
    currency: "ILS",
    formatted: "₪1,000.00",
  },
  dailyRemaining: { amount: 4750, currency: "ILS", formatted: "₪4,750.00" },
  warnings: ["This is the first time you send money to Maya."],
};

export const assistantNoticeBlock: AssistantResponseBlock = {
  id: "blk_notice",
  type: "notice",
  title: { text: "Heads up", dir: "ltr" },
  tone: "warning",
  message: {
    text: "I can prepare a transfer, but you always confirm it yourself before any money moves.",
    dir: "ltr",
  },
};

export const assistantEmptyStateBlock: AssistantResponseBlock = {
  id: "blk_empty",
  type: "empty_state",
  title: { text: "Nothing to show yet", dir: "ltr" },
  message: {
    text: "You have no transactions with this person yet.",
    dir: "ltr",
  },
};

export const assistantCounterpartySummaryBlock: AssistantResponseBlock = {
  id: "blk_counterparty_summary",
  type: "counterparty_summary",
  counterpartyName: { text: "Maya Cohen", dir: "ltr" },
  counterpartyEmailMasked: "m***@virly.test",
  sentTotal: { amount: 1240, currency: "ILS", formatted: "₪1,240.00" },
  receivedTotal: { amount: 450, currency: "ILS", formatted: "₪450.00" },
  net: { amount: 790, currency: "ILS", formatted: "₪790.00" },
  netDirection: "sent",
  transactionCount: 8,
};

/** A read-only showcase of several block types stacked together. */
export const assistantShowcaseBlocks: AssistantResponseBlock[] = [
  assistantTextBlock,
  assistantAccountSummaryBlock,
  assistantTransactionListBlock,
];

export const aiChatResponseFixture: AiChatResponse = {
  message: "Your balance is ₪1,250.00.",
  responseMessage: "Your balance is ₪1,250.00.",
  responseFormatVersion: 1,
  responseBlocks: assistantShowcaseBlocks,
  conversationId: "conv_test_0001",
  assistantId: "oshri",
  intent: "balance_inquiry",
  toolCalls: ["getAccountBalance"],
};
