import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AssistantBlocks,
} from "../src/components/assistant/AssistantBlocks";
import type { AssistantResponseBlock } from "../src/lib/types";
import { runAssistantGraph } from "../../server/src/ai/graph.js";
import { assistantResponseFormatVersion } from "../../server/src/ai/responseBlocks.js";
import { createToolResult } from "../../server/src/ai/toolResults.js";
import type {
  AssistantIntent,
  AssistantLlmProvider,
  AssistantToolExecutors,
} from "../../server/src/ai/state.js";

function createStructuredLlmProvider(intent: AssistantIntent): AssistantLlmProvider {
  return {
    async classifyIntent() {
      return { intent };
    },
    async extractTransferDraft() {
      return {};
    },
    async resolveCounterpartyReference() {
      return { kind: "none", confidence: "low" };
    },
    async composeResponse(input) {
      return input.structuredResponse?.introFallbackMessage ?? input.fallbackMessage;
    },
  };
}

function assertStructuredMarkup(input: {
  html: string;
  message: string;
  expectedText: RegExp;
}) {
  assert.match(input.html, input.expectedText);
  assert.match(input.html, /dir="rtl"/);
  assert.match(input.html, /<bdi[^>]+dir="ltr"/);
  assert.match(input.html, /min-w-0/);
  assert.match(input.html, /break-words|break-all|overflow-wrap:anywhere/);
  assert.doesNotMatch(input.message, /\*\*|^\s*[-*]\s+/m);
  assert.doesNotMatch(input.html, /\*\*/);
}

async function runAndRenderScenario(input: {
  intent: AssistantIntent;
  message: string;
  tools: AssistantToolExecutors;
  expectedBlockType: AssistantResponseBlock["type"];
}) {
  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: `structured-e2e-${input.expectedBlockType}`,
      message: input.message,
    },
    {
      tools: input.tools,
      llmProvider: createStructuredLlmProvider(input.intent),
    },
  );
  const blocks = result.responseBlocks ?? [];
  const html = renderToStaticMarkup(
    <AssistantBlocks blocks={blocks} locale="he-IL" />,
  );

  assert.equal(result.responseFormatVersion, assistantResponseFormatVersion);
  assert.equal(blocks[0]?.type, input.expectedBlockType);

  return {
    result,
    html,
  };
}

test("e2e renders Hebrew account summary as structured cards without raw Markdown", async () => {
  const { result, html } = await runAndRenderScenario({
    intent: "account_summary",
    message: "מה מצב החשבון שלי?",
    expectedBlockType: "account_summary",
    tools: {
      async getUserAccounts() {
        return createToolResult({
          toolName: "getUserAccounts",
          status: "ok",
          data: { accountLabel: "Virly checking" },
          summary: "Virly checking",
          metadata: { recordCount: 1, accountLabel: "Virly checking" },
        });
      },
      async getAccountBalance() {
        return createToolResult({
          toolName: "getAccountBalance",
          status: "ok",
          data: { balance: 1234.56 },
          summary: "Balance: **should not render as markdown source**",
          metadata: {
            recordCount: 1,
            accountLabel: "Virly checking",
            amount: 1234.56,
          },
        });
      },
    },
  });

  assertStructuredMarkup({
    html,
    message: result.message,
    expectedText: /סיכום חשבון|יתרה זמינה/,
  });
  assert.match(html, /₪/);
});

test("e2e renders Hebrew recent transactions with mixed names and emails", async () => {
  const { result, html } = await runAndRenderScenario({
    intent: "recent_transactions",
    message: "תראה לי עסקאות אחרונות",
    expectedBlockType: "transaction_list",
    tools: {
      async getRecentTransactions() {
        return createToolResult({
          toolName: "getRecentTransactions",
          status: "ok",
          data: [
            {
              transactionId: "tx-recent-1",
              direction: "sent",
              amount: 23364.07,
              currency: "ILS",
              counterpartyLabel:
                "Shai Gilgeous-Alexander With A Very Long Display Name (very.long.email.address@example.com)",
              counterpartyEmail: "very.long.email.address@example.com",
              reason: "בדיקת תצוגה",
              occurredAt: "2026-06-07T10:22:00.000Z",
              status: "completed",
            },
            {
              transactionId: "tx-recent-2",
              direction: "received",
              amount: 136.78,
              currency: "ILS",
              counterpartyLabel: "נועה כהן (noa.cohen@example.com)",
              counterpartyEmail: "noa.cohen@example.com",
              reason: null,
              occurredAt: "2026-06-06T09:00:00.000Z",
              status: "completed",
            },
          ],
          summary: "Recent transactions: **do not use this markdown list**",
          metadata: { recordCount: 2 },
        });
      },
    },
  });

  assertStructuredMarkup({
    html,
    message: result.message,
    expectedText: /very\.long\.email\.address@example\.com/,
  });
  assert.match(html, /noa\.cohen@example\.com/);
});

test("e2e renders Hebrew transaction search results from trusted rows", async () => {
  const { result, html } = await runAndRenderScenario({
    intent: "transaction_search",
    message: "חפש עסקאות מעל 100 שקל",
    expectedBlockType: "transaction_list",
    tools: {
      async searchTransactions() {
        return createToolResult({
          toolName: "searchTransactions",
          status: "ok",
          data: [
            {
              transactionId: "tx-search-1",
              direction: "sent",
              amount: 450,
              currency: "ILS",
              counterpartyLabel: "English Recipient (english.recipient@example.com)",
              counterpartyEmail: "english.recipient@example.com",
              reason: "שכר דירה",
              occurredAt: "2026-06-05T08:30:00.000Z",
              status: "completed",
            },
          ],
          summary: "Transactions: - malformed markdown bullet should not render.",
          metadata: { recordCount: 1, amount: 450 },
        });
      },
    },
  });

  assertStructuredMarkup({
    html,
    message: result.message,
    expectedText: /english\.recipient@example\.com/,
  });
  assert.match(html, /שכר דירה/);
});

test("e2e renders Hebrew pending transfers without changing confirmation flow", async () => {
  const { result, html } = await runAndRenderScenario({
    intent: "pending_ai_transfers",
    message: "תראה לי העברות ממתינות",
    expectedBlockType: "pending_transfers",
    tools: {
      async getPendingAiTransfers() {
        return createToolResult({
          toolName: "getPendingAiTransfers",
          status: "ok",
          data: [
            {
              pendingTransferId: "pending-transfer-1",
              conversationId: "structured-e2e-pending",
              label:
                "1. 500.00 ILS to Very Long Recipient Name (recipient.long.email@example.com)",
              recipientLabel:
                "Very Long Recipient Name Mixed עברית (recipient.long.email@example.com)",
              amount: 500,
              currency: "ILS",
              reason: "מקדמה",
              status: "pending",
              expiresAt: "2026-06-08T12:00:00.000Z",
            },
          ],
          summary:
            "Pending transfer confirmations: **do not show this markdown**.",
          metadata: { recordCount: 1 },
        });
      },
    },
  });

  assertStructuredMarkup({
    html,
    message: result.message,
    expectedText: /recipient\.long\.email@example\.com/,
  });
  assert.match(html, /מקדמה/);
  assert.doesNotMatch(html, /Confirm|Deny/);
});
