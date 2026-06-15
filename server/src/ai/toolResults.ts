import type {
  AssistantToolResult,
  RuntimeToolResult,
  SafeToolSummary,
  ToolDisplayData,
  ToolResultMetadata
} from "./state.js";

export type ResolutionResultData =
  | {
      kind: "counterparty";
      status: "resolved";
      counterparty: {
        email: string;
        maskedLabel: string;
        userLabel?: string;
        displayName?: string;
      };
      candidates?: Array<{
        id: string;
        label: string;
        value: string;
      }>;
    }
  | {
      kind: "counterparty" | "transaction" | "pending_transfer";
      status: "ambiguous" | "unresolved";
      candidates?: Array<{
        id: string;
        label: string;
        value: string;
      }>;
    }
  | {
      kind: "transaction";
      status: "resolved";
      transactionId: string;
      candidates?: Array<{
        id: string;
        label: string;
        value: string;
      }>;
    }
  | {
      kind: "pending_transfer";
      status: "resolved";
      pendingTransferId: string;
      candidates?: Array<{
        id: string;
        label: string;
        value: string;
      }>;
    };

export function createToolResult<TData>(input: {
  toolName: RuntimeToolResult<TData>["toolName"];
  status: RuntimeToolResult<TData>["status"];
  data: TData | null;
  summary: string;
  userSummary?: string;
  userSummaryHe?: string;
  metadata?: ToolResultMetadata;
  memoryUpdates?: RuntimeToolResult<TData>["memoryUpdates"];
}): RuntimeToolResult<TData> {
  return {
    toolName: input.toolName,
    status: input.status,
    data: input.data,
    displayData: {
      summary: input.summary,
      userSummary: input.userSummary,
      userSummaryHe: input.userSummaryHe,
      metadata: input.metadata ?? {}
    },
    memoryUpdates: input.memoryUpdates
  };
}

export function getToolDisplayData(
  result: RuntimeToolResult
): ToolDisplayData {
  const displayData = result.displayData as ToolDisplayData | undefined;

  return displayData ?? {
    summary: "",
    metadata: {}
  };
}

export function toAssistantToolResult(
  result: RuntimeToolResult
): AssistantToolResult {
  const displayData = getToolDisplayData(result);

  return {
    toolName: result.toolName,
    summary: displayData.summary,
    metadata: displayData.metadata
  };
}

export function sanitizeToolResultMetadata(
  metadata: ToolResultMetadata
): Record<string, unknown> {
  const {
    counterpartyEmail: _counterpartyEmail,
    counterparties,
    counterpartyCandidates,
    transactions,
    transactionCandidates,
    pendingTransfers,
    pendingTransferCandidates,
    ...safeMetadata
  } = metadata;

  return {
    ...safeMetadata,
    ...(counterparties
      ? {
          counterparties: counterparties.map(
            ({ counterpartyEmail: _email, ...counterparty }) => counterparty
          )
        }
      : {}),
    ...(counterpartyCandidates
      ? {
          counterpartyCandidates: counterpartyCandidates.map(
            ({ counterpartyEmail: _email, ...counterparty }) => counterparty
          )
        }
      : {}),
    ...(transactions ? { transactions } : {}),
    ...(transactionCandidates ? { transactionCandidates } : {}),
    ...(pendingTransfers ? { pendingTransfers } : {}),
    ...(pendingTransferCandidates ? { pendingTransferCandidates } : {})
  };
}

export function toSafeToolSummary(
  result: RuntimeToolResult
): SafeToolSummary {
  const displayData = getToolDisplayData(result);

  return {
    toolName: result.toolName,
    summary: displayData.summary,
    metadata: sanitizeToolResultMetadata(displayData.metadata)
  };
}

export function getUserVisibleSummary(result: RuntimeToolResult, locale?: "he") {
  const displayData = getToolDisplayData(result);
  if (locale === "he" && displayData.userSummaryHe) {
    return displayData.userSummaryHe;
  }
  return displayData.userSummary ?? displayData.summary;
}

export function getResolutionResultData(
  result: RuntimeToolResult
): ResolutionResultData | undefined {
  const data = result.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const value = data as Partial<ResolutionResultData>;
  if (
    (value.kind === "counterparty" ||
      value.kind === "transaction" ||
      value.kind === "pending_transfer") &&
    (value.status === "resolved" ||
      value.status === "ambiguous" ||
      value.status === "unresolved")
  ) {
    return value as ResolutionResultData;
  }

  return undefined;
}
