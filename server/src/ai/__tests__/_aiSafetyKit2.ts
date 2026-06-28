import { fakeResult, createFakeTools } from "./_aiSafetyKit1.js";
import type {
  AssistantToolExecutors,
  ToolContext
} from "../state.js";

export function createFakePhaseTwoCounterpartyTools(executed: string[]): AssistantToolExecutors {
  return {
    ...createFakeTools(executed),
    async getRecentSentCounterparties() {
      executed.push("getRecentSentCounterparties");
      return fakeResult({
        toolName: "getRecentSentCounterparties",
        memoryUpdates: {
          counterparties: [
            { counterpartyId: "daniel@example.com", emailFullForBackendOnly: "daniel@example.com", emailMasked: "d***@example.com", displayName: "Daniel Example", relation: "sent_to", source: "transaction" },
            { counterpartyId: "rani@example.com", emailFullForBackendOnly: "rani@example.com", emailMasked: "m***@example.com", displayName: "Rani Example", relation: "sent_to", source: "transaction" }
          ]
        },
        data: [
          { counterpartyId: "daniel@example.com", emailFull: "daniel@example.com", emailMasked: "d***@example.com", llmLabel: "Daniel Example (d***@example.com)", userLabel: "Daniel Example (daniel@example.com)", displayName: "Daniel Example", amount: 50 },
          { counterpartyId: "rani@example.com", emailFull: "rani@example.com", emailMasked: "m***@example.com", llmLabel: "Rani Example (m***@example.com)", userLabel: "Rani Example (rani@example.com)", displayName: "Rani Example", amount: 25 }
        ],
        summary: "Recent people you sent money to: Daniel Example (d***@example.com); Rani Example (m***@example.com).",
        userSummary: "Recent people you sent money to: Daniel Example (daniel@example.com); Rani Example (rani@example.com).",
        metadata: { recordCount: 2, counterparties: [{ counterpartyEmail: "daniel@example.com", maskedLabel: "d***@example.com", displayName: "Daniel Example" }, { counterpartyEmail: "rani@example.com", maskedLabel: "m***@example.com", displayName: "Rani Example" }] }
      });
    },
    async getRecentReceivedCounterparties() {
      executed.push("getRecentReceivedCounterparties");
      return fakeResult({
        toolName: "getRecentReceivedCounterparties",
        data: [{ counterpartyId: "sarah@example.com", emailFull: "sarah@example.com", emailMasked: "s***@example.com", llmLabel: "Sarah Example (s***@example.com)", userLabel: "Sarah Example (sarah@example.com)", displayName: "Sarah Example", amount: 40 }],
        summary: "Recent people who sent you money: Sarah Example (s***@example.com).",
        userSummary: "Recent people who sent you money: Sarah Example (sarah@example.com).",
        metadata: { recordCount: 1, counterparties: [{ counterpartyEmail: "sarah@example.com", maskedLabel: "s***@example.com", displayName: "Sarah Example" }] }
      });
    },
    async resolveCounterpartyCandidates(context: ToolContext) {
      executed.push("resolveCounterpartyCandidates");
      if (/ambiguous|two daniels/i.test(context.message)) {
        return fakeResult({
          toolName: "resolveCounterpartyCandidates",
          data: { kind: "counterparty", status: "ambiguous", candidates: [{ id: "daniel.a@example.com", label: "Daniel A (daniel.a@example.com)", value: "daniel.a@example.com" }, { id: "daniel.b@example.net", label: "Daniel B (daniel.b@example.net)", value: "daniel.b@example.net" }] },
          summary: "I found multiple possible counterparties: Daniel A (d***@example.com); Daniel B (d***@example.net).",
          userSummary: "I found multiple possible counterparties: Daniel A (daniel.a@example.com); Daniel B (daniel.b@example.net).",
          metadata: { recordCount: 2, resolutionStatus: "ambiguous", counterpartyCandidates: [{ counterpartyEmail: "daniel.a@example.com", maskedLabel: "d***@example.com", displayName: "Daniel A", confidence: "high" }, { counterpartyEmail: "daniel.b@example.net", maskedLabel: "d***@example.net", displayName: "Daniel B", confidence: "high" }] }
        });
      }
      return fakeResult({
        toolName: "resolveCounterpartyCandidates",
        data: { kind: "counterparty", status: "resolved", counterparty: { email: "daniel@example.com", maskedLabel: "d***@example.com", userLabel: "Daniel Example (daniel@example.com)", displayName: "Daniel Example" }, candidates: [{ id: "daniel@example.com", label: "Daniel Example (daniel@example.com)", value: "daniel@example.com" }] },
        summary: "Resolved counterparty: Daniel Example (d***@example.com).",
        userSummary: "Resolved counterparty: Daniel Example (daniel@example.com).",
        metadata: { recordCount: 1, resolutionStatus: "resolved", counterpartyEmail: "daniel@example.com", maskedLabel: "d***@example.com", displayName: "Daniel Example", counterpartyCandidates: [{ counterpartyEmail: "daniel@example.com", maskedLabel: "d***@example.com", displayName: "Daniel Example", confidence: "high" }] }
      });
    },
    async getCounterpartySummary(context: ToolContext) {
      executed.push(`getCounterpartySummary:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getCounterpartySummary",
        summary: "History with Daniel Example (d***@example.com): sent 70.00 ILS, received 20.00 ILS, net -50.00 ILS.",
        userSummary: "History with Daniel Example (daniel@example.com): sent 70.00 ILS, received 20.00 ILS, net -50.00 ILS.",
        metadata: { recordCount: 3, amount: -50, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel, displayName: "Daniel Example" }
      });
    },
    async getCounterpartyActivityTimeline(context: ToolContext) {
      executed.push(`getCounterpartyActivityTimeline:${context.resolvedCounterparty?.email ?? "none"}`);
      return fakeResult({
        toolName: "getCounterpartyActivityTimeline",
        summary: "Recent activity with Daniel Example (d***@example.com): sent 50.00 ILS; received 20.00 ILS.",
        userSummary: "Recent activity with Daniel Example (daniel@example.com): sent 50.00 ILS; received 20.00 ILS.",
        metadata: { recordCount: 2, counterpartyEmail: context.resolvedCounterparty?.email, maskedLabel: context.resolvedCounterparty?.maskedLabel, displayName: "Daniel Example" }
      });
    }
  };
}

export function createFakePhaseThreeTransactionTools(executed: string[]): AssistantToolExecutors {
  return {
    ...createFakePhaseTwoCounterpartyTools(executed),
    async searchTransactions() {
      executed.push("searchTransactions");
      return fakeResult({
        toolName: "searchTransactions",
        memoryUpdates: {
          transactions: [
            { transactionId: "tx-1", label: "1. sent 120.00 ILS with Daniel Example (daniel@example.com)", amount: 120, currency: "ILS", direction: "sent", occurredAt: "2026-05-18T10:00:00.000Z", counterpartyLabel: "Daniel Example (daniel@example.com)" },
            { transactionId: "tx-2", label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)", amount: 200, currency: "ILS", direction: "received", occurredAt: "2026-05-19T10:00:00.000Z", counterpartyLabel: "Sarah Example (sarah@example.com)" }
          ]
        },
        summary: "Transactions matching sent, over 100.00 ILS, last week: 1. sent 120.00 ILS with Daniel Example (d***@example.com); 2. received 200.00 ILS with Sarah Example (s***@example.com).",
        userSummary: "Transactions matching sent, over 100.00 ILS, last week: 1. sent 120.00 ILS with Daniel Example (daniel@example.com); 2. received 200.00 ILS with Sarah Example (sarah@example.com).",
        metadata: { recordCount: 2, transactions: [{ transactionId: "tx-1", label: "1. sent 120.00 ILS with Daniel Example (d***@example.com)", amount: 120, currency: "ILS", direction: "sent", occurredAt: "2026-05-18T10:00:00.000Z", counterpartyLabel: "Daniel Example (d***@example.com)" }, { transactionId: "tx-2", label: "2. received 200.00 ILS with Sarah Example (s***@example.com)", amount: 200, currency: "ILS", direction: "received", occurredAt: "2026-05-19T10:00:00.000Z", counterpartyLabel: "Sarah Example (s***@example.com)" }] }
      });
    },
    async getTransactionStats() {
      executed.push("getTransactionStats");
      return fakeResult({
        toolName: "getTransactionStats",
        data: { count: 4, sentTotal: 150, receivedTotal: 300, net: 150 },
        summary: "Transaction stats for this month: 4 total, sent 150.00 ILS across 2, received 300.00 ILS across 2, net 150.00 ILS.",
        metadata: { recordCount: 4, amount: 150 }
      });
    },
    async resolveTransactionReference(context: ToolContext) {
      executed.push("resolveTransactionReference");
      if (/ambiguous|which/i.test(context.message)) {
        return fakeResult({
          toolName: "resolveTransactionReference",
          data: { kind: "transaction", status: "ambiguous", candidates: [{ id: "tx-1", label: "1. sent 120.00 ILS with Daniel Example (daniel@example.com)", value: "tx-1" }, { id: "tx-2", label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)", value: "tx-2" }] },
          summary: "Multiple recent transactions matched that reference.",
          metadata: { recordCount: 2, transactionResolutionStatus: "ambiguous", transactionCandidates: [{ transactionId: "tx-1", label: "1. sent 120.00 ILS with Daniel Example (d***@example.com)", amount: 120, currency: "ILS", direction: "sent", occurredAt: "2026-05-18T10:00:00.000Z" }, { transactionId: "tx-2", label: "2. received 200.00 ILS with Sarah Example (s***@example.com)", amount: 200, currency: "ILS", direction: "received", occurredAt: "2026-05-19T10:00:00.000Z" }] }
        });
      }
      const transactionId = /second|2nd|שני|שנייה/.test(context.message) ? "tx-2" : "tx-1";
      return fakeResult({
        toolName: "resolveTransactionReference",
        data: { kind: "transaction", status: "resolved", transactionId, candidates: [{ id: transactionId, label: transactionId === "tx-2" ? "2. received 200.00 ILS with Sarah Example (sarah@example.com)" : "1. sent 120.00 ILS with Daniel Example (daniel@example.com)", value: transactionId }] },
        summary: `Resolved transaction reference to ${transactionId}.`,
        metadata: { recordCount: 1, transactionId, transactionResolutionStatus: "resolved", transactionCandidates: [{ transactionId, label: transactionId === "tx-2" ? "2. received 200.00 ILS with Sarah Example (s***@example.com)" : "1. sent 120.00 ILS with Daniel Example (d***@example.com)", amount: transactionId === "tx-2" ? 200 : 120, currency: "ILS", direction: transactionId === "tx-2" ? "received" : "sent", occurredAt: "2026-05-19T10:00:00.000Z" }] }
      });
    },
    async getTransactionReceipt(context: ToolContext) {
      executed.push(`getTransactionReceipt:${context.resolvedTransactionId ?? "none"}`);
      return fakeResult({
        toolName: "getTransactionReceipt",
        summary: `Transaction details for ${context.resolvedTransactionId}: received 200.00 ILS with Sarah Example (s***@example.com).`,
        userSummary: `Transaction details for ${context.resolvedTransactionId}: received 200.00 ILS with Sarah Example (sarah@example.com).`,
        data: { transactionId: context.resolvedTransactionId ?? "missing", label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)", llmLabel: "2. received 200.00 ILS with Sarah Example (s***@example.com)", amount: 200, currency: "ILS", direction: "received", counterpartyLabel: "Sarah Example (sarah@example.com)", counterpartyMaskedLabel: "s***@example.com", counterpartyEmail: "sarah@example.com", reason: null, occurredAt: "2026-05-19T10:00:00.000Z", status: "completed" },
        metadata: { recordCount: 1, transactionId: context.resolvedTransactionId, transactions: [{ transactionId: context.resolvedTransactionId ?? "missing", label: "2. received 200.00 ILS with Sarah Example (s***@example.com)", amount: 200, currency: "ILS", direction: "received", occurredAt: "2026-05-19T10:00:00.000Z", status: "completed", counterpartyLabel: "Sarah Example (s***@example.com)" }] }
      });
    }
  };
}
