import type { AssistantId } from "./assistants.js";

export type AssistantIntent =
  | "balance_inquiry"
  | "recent_transactions"
  | "verified_recipients"
  | "transfer_limits"
  | "transfer_status"
  | "general_help"
  | "unsafe_request"
  | "unsupported";

export type AssistantToolName =
  | "getUserAccounts"
  | "getAccountBalance"
  | "getRecentTransactions"
  | "getVerifiedRecipients"
  | "getTransferLimits";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ToolResultMetadata = {
  recordCount?: number;
  accountLabel?: string;
  transactionId?: string;
};

export type AssistantToolResult = {
  toolName: AssistantToolName;
  summary: string;
  metadata: ToolResultMetadata;
};

export type IntentClassification = {
  intent: AssistantIntent;
  refusalReason?: string;
};

export type ComposeAssistantResponseInput = {
  assistantId: AssistantId;
  userMessage: string;
  intent: AssistantIntent;
  toolResults: AssistantToolResult[];
  refusalReason?: string;
  fallbackMessage: string;
};

export type AssistantLlmProvider = {
  classifyIntent(message: string): Promise<IntentClassification>;
  composeResponse(input: ComposeAssistantResponseInput): Promise<string>;
};

export type AssistantGraphState = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId: AssistantId;
  messages: ChatMessage[];
  detectedIntent?: AssistantIntent;
  selectedAccountId?: string;
  requestedToolNames: AssistantToolName[];
  executedToolNames: AssistantToolName[];
  toolResults: AssistantToolResult[];
  refusalReason?: string;
  responseMessage?: string;
};

export type ToolContext = {
  userId: string;
  conversationId: string;
  message: string;
};

export type ToolExecutor = (
  context: ToolContext
) => Promise<AssistantToolResult>;

export type AssistantToolExecutors = Record<AssistantToolName, ToolExecutor>;

export type AuditLogInput = {
  userId: string;
  conversationId: string;
  requestId?: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolsRequested: string[];
  toolsExecuted: string[];
  refusalReason?: string;
};

export type AuditLogger = (input: AuditLogInput) => Promise<void>;

export type RunAssistantInput = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId?: AssistantId;
  message: string;
};

export type RunAssistantResult = {
  message: string;
  conversationId: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolCalls: AssistantToolName[];
  refusalReason?: string;
};
