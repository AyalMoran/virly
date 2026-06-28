import { readFileSync } from "node:fs";
import { createToolResult } from "../toolResults.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type {
  AssistantToolExecutors,
  ToolContext
} from "../state.js";

export async function withTransactionRepoStub(
  overrides: Partial<ReturnType<typeof createMongoRepositories>["transactions"]>,
  fn: () => Promise<void>
): Promise<void> {
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    transactions: { ...base.transactions, ...overrides }
  });
  try {
    await fn();
  } finally {
    setRepositories(base);
  }
}

export function extractOpenApiEnumValues(schemaName: string) {
  const openApiText = readFileSync(
    new URL("../../../../openapi.yaml", import.meta.url),
    "utf8"
  );
  const schemaPattern = new RegExp(
    `\\n\\s{4}${schemaName}:\\n\\s+type:\\s+string\\n\\s+enum:\\n((?:\\s+- .+\\n)+)`
  );
  const match = openApiText.match(schemaPattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract OpenAPI enum for ${schemaName}.`);
  }
  return match[1].trim().split("\n").map((line) => line.trim().replace(/^- /, ""));
}

export function extractOpenApiPropertyEnumValues(schemaName: string, propertyName: string) {
  const openApiText = readFileSync(
    new URL("../../../../openapi.yaml", import.meta.url),
    "utf8"
  );
  const propertyPattern = new RegExp(
    `\\n\\s{4}${schemaName}:\\n[\\s\\S]*?\\n\\s{8}${propertyName}:\\n\\s{10}type:\\s+string\\n\\s{10}enum:\\n((?:\\s{12}- .+\\n)+)`
  );
  const match = openApiText.match(propertyPattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract OpenAPI enum for ${schemaName}.${propertyName}.`);
  }
  return match[1].trim().split("\n").map((line) => line.trim().replace(/^- /, ""));
}

export function extractOpenApiNestedEnumValues(schemaName: string, propertyPath: string[]) {
  const openApiText = readFileSync(
    new URL("../../../../openapi.yaml", import.meta.url),
    "utf8"
  );
  const pathPattern = propertyPath.map((segment) => `\\n\\s+${segment}:`).join("[\\s\\S]*?");
  const pattern = new RegExp(
    `\\n\\s{4}${schemaName}:\\n[\\s\\S]*?${pathPattern}[\\s\\S]*?\\n\\s+enum:\\n((?:\\s+- .+\\n)+)`
  );
  const match = openApiText.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract nested OpenAPI enum for ${schemaName}.${propertyPath.join(".")}.`);
  }
  return match[1].trim().split("\n").map((line) => line.trim().replace(/^- /, ""));
}

export function extractOpenApiOneOfPropertyEnumValues(schemaName: string, propertyName: string) {
  const openApiText = readFileSync(
    new URL("../../../../openapi.yaml", import.meta.url),
    "utf8"
  );
  const schemaPattern = new RegExp(
    `\\n\\s{4}${schemaName}:\\n([\\s\\S]*?)(?=\\n\\s{4}[A-Z]|$)`
  );
  const schemaMatch = openApiText.match(schemaPattern);
  if (!schemaMatch?.[1]) {
    throw new Error(`Could not find OpenAPI schema ${schemaName}.`);
  }
  const propertyPattern = new RegExp(
    `\\n\\s+${propertyName}:\\n\\s+type:\\s+string\\n\\s+enum:\\n((?:\\s+- .+\\n)+)`,
    "g"
  );
  const values: string[] = [];
  const matches = schemaMatch[1].matchAll(propertyPattern);
  for (const match of matches) {
    const block = match[1];
    if (!block) continue;
    for (const line of block.trim().split("\n")) {
      values.push(line.trim().replace(/^- /, ""));
    }
  }
  if (values.length === 0) {
    throw new Error(`Could not extract OpenAPI oneOf property enum for ${schemaName}.${propertyName}.`);
  }
  return values;
}

export function extractClientTypeUnionValues(typeName: string) {
  const clientTypesText = readFileSync(
    new URL("../../../../client/src/lib/types.ts", import.meta.url),
    "utf8"
  );
  const multilinePattern = new RegExp(
    `export type ${typeName} =\\n((?:\\s+\\| \\".+\\";?\\n)+)`,
    "m"
  );
  const inlinePattern = new RegExp(
    `export type ${typeName} = ((?:\\"[^\\"]+\\"(?: \\| )?)+);`,
    "m"
  );
  const multilineMatch = clientTypesText.match(multilinePattern);
  const inlineMatch = clientTypesText.match(inlinePattern);
  if (multilineMatch?.[1]) {
    return multilineMatch[1].trim().split("\n").map((line) =>
      line.trim().replace(/^\| /, "").replace(/^"|"$/g, "").replace(/";$/, "")
    );
  }
  if (inlineMatch?.[1]) {
    return inlineMatch[1].split(" | ").map((value) => value.replace(/^"|"$/g, ""));
  }
  throw new Error(`Could not extract client type union for ${typeName}.`);
}

export function fakeResult(input: {
  toolName: Parameters<typeof createToolResult>[0]["toolName"];
  summary: string;
  userSummary?: string;
  metadata?: Parameters<typeof createToolResult>[0]["metadata"];
  status?: "ok" | "empty" | "error";
  data?: unknown;
  memoryUpdates?: Parameters<typeof createToolResult>[0]["memoryUpdates"];
}) {
  return createToolResult({
    toolName: input.toolName,
    status: input.status ?? "ok",
    data: input.data ?? null,
    summary: input.summary,
    userSummary: input.userSummary,
    metadata: input.metadata,
    memoryUpdates: input.memoryUpdates
  });
}

export function createFakeTools(
  executed: string[],
  counterpartyEmail = "alex@example.com"
): AssistantToolExecutors {
  const maskedLabel = "a***@example.com";
  const userLabel = "alex@example.com";
  return {
    async getUserAccounts() {
      executed.push("getUserAccounts");
      return fakeResult({
        toolName: "getUserAccounts",
        summary: "Virly account",
        metadata: { recordCount: 1, accountLabel: "Virly account" }
      });
    },
    async getAccountBalance() {
      executed.push("getAccountBalance");
      return fakeResult({
        toolName: "getAccountBalance",
        summary: "Your Virly account available balance is 125.00.",
        metadata: { recordCount: 1, accountLabel: "Virly account", amount: 125 }
      });
    },
    async getRecentTransactions() {
      executed.push("getRecentTransactions");
      return fakeResult({
        toolName: "getRecentTransactions",
        summary: "Recent transactions: sent 10.00 with a***@example.com.",
        userSummary: "Recent transactions: sent 10.00 with alex@example.com.",
        metadata: { recordCount: 1 }
      });
    },
    async getLastSentCounterparty() {
      executed.push("getLastSentCounterparty");
      return fakeResult({
        toolName: "getLastSentCounterparty",
        summary: `The last person you sent money to was ${maskedLabel}.`,
        userSummary: `The last person you sent money to was ${userLabel}.`,
        data: { email: counterpartyEmail, maskedLabel, userLabel },
        metadata: { recordCount: 1, counterpartyEmail, maskedLabel },
        memoryUpdates: {
          counterparties: [{
            counterpartyId: counterpartyEmail,
            emailFullForBackendOnly: counterpartyEmail,
            emailMasked: maskedLabel,
            displayName: "Alex Example",
            relation: "sent_to",
            source: "transaction"
          }]
        }
      });
    },
    async getTransactionsWithCounterparty(context: ToolContext) {
      executed.push(`getTransactionsWithCounterparty:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getTransactionsWithCounterparty",
        summary: `Recent transactions with ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel}: sent 10.00.`,
        userSummary: `Recent transactions with ${context.resolvedCounterparty?.userLabel ?? userLabel}: sent 10.00.`,
        metadata: { recordCount: 1, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel }
      });
    },
    async getTotalSentToCounterparty(context: ToolContext) {
      executed.push(`getTotalSentToCounterparty:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getTotalSentToCounterparty",
        summary: `You have sent 42.00 in total to ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel}.`,
        userSummary: `You have sent 42.00 in total to ${context.resolvedCounterparty?.userLabel ?? userLabel}.`,
        metadata: { recordCount: 2, amount: 42, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel },
        memoryUpdates: {
          totals: [{
            id: `sent:${context.resolvedCounterparty?.email ?? counterpartyEmail}`,
            counterpartyEmail: context.resolvedCounterparty?.email ?? counterpartyEmail,
            direction: "sent",
            amount: 42,
            currency: "ILS",
            sourceToolName: "getTotalSentToCounterparty",
            aliases: ["that amount", "that total", "the total I sent"]
          }]
        }
      });
    },
    async getTotalReceivedFromCounterparty(context: ToolContext) {
      executed.push(`getTotalReceivedFromCounterparty:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getTotalReceivedFromCounterparty",
        summary: `${context.resolvedCounterparty?.maskedLabel ?? maskedLabel} has sent you 35.00 in total.`,
        userSummary: `${context.resolvedCounterparty?.userLabel ?? userLabel} has sent you 35.00 in total.`,
        metadata: { recordCount: 2, amount: 35, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel },
        memoryUpdates: {
          totals: [{
            id: `received:${context.resolvedCounterparty?.email ?? counterpartyEmail}`,
            counterpartyEmail: context.resolvedCounterparty?.email ?? counterpartyEmail,
            direction: "received",
            amount: 35,
            currency: "ILS",
            sourceToolName: "getTotalReceivedFromCounterparty",
            aliases: ["that amount", "that total", "the total they sent me"]
          }]
        }
      });
    },
    async getNetWithCounterparty(context: ToolContext) {
      executed.push(`getNetWithCounterparty:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getNetWithCounterparty",
        summary: `Net with ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel}: received 35.00, sent 20.00, net 15.00.`,
        userSummary: `Net with ${context.resolvedCounterparty?.userLabel ?? userLabel}: received 35.00, sent 20.00, net 15.00.`,
        metadata: { recordCount: 3, amount: 15, netAmount: 15, receivedAmount: 35, sentAmount: 20, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel },
        memoryUpdates: {
          totals: [{
            id: `net:${context.resolvedCounterparty?.email ?? counterpartyEmail}`,
            counterpartyEmail: context.resolvedCounterparty?.email ?? counterpartyEmail,
            direction: "net",
            amount: 15,
            currency: "ILS",
            sourceToolName: "getNetWithCounterparty",
            aliases: ["that amount", "that total", "the net total"]
          }]
        }
      });
    },
    async getVerifiedRecipients() {
      executed.push("getVerifiedRecipients");
      return fakeResult({
        toolName: "getVerifiedRecipients",
        summary: "Verified recipients from your history: a***@example.com.",
        userSummary: "Verified recipients from your history: alex@example.com.",
        metadata: { recordCount: 1 }
      });
    },
    async getTransferLimits() {
      executed.push("getTransferLimits");
      return fakeResult({
        toolName: "getTransferLimits",
        summary: "Current development transfer limits are 500.00 per transfer.",
        metadata: { recordCount: 1 }
      });
    }
  };
}
