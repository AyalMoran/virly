import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AssistantBlocks,
  AssistantMarkdown,
} from "../../../components/assistant/AssistantBlocks";
import type { AssistantResponseBlock } from "../../../lib/types";

test("fallback markdown renders sanitized bold, bullets, emails, and amounts", () => {
  const html = renderToStaticMarkup(
    <AssistantMarkdown
      text={
        "**שלום**\n- שילמתי ₪ 23,364.07 ל very.long.email.address@example.com"
      }
    />,
  );

  expect(html).toMatch(/<strong/);
  expect(html).toMatch(/<ul/);
  expect(html).toMatch(/<bdi[^>]+dir="ltr"/);
  expect(html).toMatch(/very\.long\.email\.address@example\.com/);
  expect(html).not.toMatch(/\*\*/);
});

test("transaction blocks render RTL-safe mixed Hebrew English financial data", () => {
  const blocks: AssistantResponseBlock[] = [
    {
      id: "recent-transactions",
      type: "transaction_list",
      title: { text: "עסקאות אחרונות", dir: "rtl" },
      subtitle: { text: "2 עסקאות", dir: "rtl" },
      transactions: [
        {
          id: "tx-1",
          direction: "sent",
          counterpartyName:
            "Shai Gilgeous-Alexander With A Very Long English Display Name",
          counterpartyEmail: "very.long.email.address@example.com",
          amount: { amount: 23364.07, currency: "ILS" },
          status: "completed",
          createdAt: "2026-06-07T10:22:00.000Z",
          description: "בדיקה"
        },
        {
          id: "tx-2",
          direction: "received",
          counterpartyName: "נועה כהן",
          counterpartyEmail: "noa.cohen@example.com",
          amount: { amount: 136.78, currency: "ILS" },
          status: "completed",
          createdAt: "2026-06-06T09:00:00.000Z"
        }
      ]
    }
  ];

  const html = renderToStaticMarkup(
    <AssistantBlocks blocks={blocks} locale="he-IL" />,
  );

  expect(html).toMatch(/dir="rtl"/);
  expect(html).toMatch(/very\.long\.email\.address@example\.com/);
  expect(html).toMatch(/noa\.cohen@example\.com/);
  expect(html).toMatch(/<bdi[^>]+dir="ltr"/);
  expect(html).toMatch(/₪/);
  expect(html).toMatch(/overflow-wrap:anywhere/);
  expect(html).not.toMatch(/\*\*/);
});

test("account and pending transfer blocks expose responsive wrapping classes", () => {
  const blocks: AssistantResponseBlock[] = [
    {
      id: "account-summary",
      type: "account_summary",
      title: { text: "סיכום חשבון", dir: "rtl" },
      availableBalance: { amount: 1234.56, currency: "ILS" },
      accountLabel: { text: "Virly account", dir: "auto" },
      items: [
        {
          label: { text: "יתרה זמינה", dir: "rtl" },
          value: { amount: 1234.56, currency: "ILS" }
        },
        {
          label: { text: "חשבון", dir: "rtl" },
          value: { text: "Virly account", dir: "auto" }
        }
      ]
    },
    {
      id: "pending-transfers",
      type: "pending_transfers",
      title: { text: "העברות ממתינות", dir: "rtl" },
      pendingTransfers: [
        {
          id: "pending-1",
          recipientLabel:
            "Very Long Recipient Name With Mixed עברית (recipient.long.email@example.com)",
          recipientEmailMasked: "r***@example.com",
          amount: { amount: 500, currency: "ILS" },
          reason: "שכר דירה",
          status: "pending",
          expiresAt: "2026-06-08T12:00:00.000Z"
        }
      ]
    }
  ];

  const html = renderToStaticMarkup(
    <AssistantBlocks blocks={blocks} locale="he-IL" />,
  );

  expect(html).toMatch(/sm:grid-cols/);
  expect(html).toMatch(/recipient\.long\.email@example\.com/);
  expect(html).toMatch(/<bdi[^>]+dir="ltr"/);
  expect(html).toMatch(/break-words|break-all/);
  expect(html).not.toMatch(/\*\*/);
});

test("transfer status and limits blocks render trusted values without raw Markdown", () => {
  const blocks: AssistantResponseBlock[] = [
    {
      id: "transfer-status-pending-1",
      type: "transfer_status",
      title: { text: "סטטוס העברה", dir: "rtl" },
      status: "pending",
      recipientLabel:
        "Very Long Pending Recipient Name עברית (pending.recipient@example.com)",
      amount: { amount: 75, currency: "ILS" },
      reason: "ארוחת צהריים",
      expiresAt: "2026-06-08T12:00:00.000Z",
      message: {
        text: "האישור עדיין ממתין. שום כסף לא הועבר עד לאישור בכרטיס.",
        dir: "rtl"
      }
    },
    {
      id: "transfer-limits",
      type: "transfer_limits",
      title: { text: "מגבלות העברה", dir: "rtl" },
      eligible: false,
      amount: { amount: 3000, currency: "ILS" },
      perTransferLimit: { amount: 1000, currency: "ILS" },
      dailyRemaining: { amount: 2100, currency: "ILS" },
      maxSendableNow: { amount: 900, currency: "ILS" },
      transferCountToday: 2,
      resetAt: "2026-06-09T00:00:00.000Z",
      reasons: ["INSUFFICIENT_BALANCE"]
    }
  ];

  const html = renderToStaticMarkup(
    <AssistantBlocks blocks={blocks} locale="he-IL" />,
  );

  expect(html).toMatch(/pending\.recipient@example\.com/);
  expect(html).toMatch(/INSUFFICIENT_BALANCE/);
  expect(html).toMatch(/Not eligible/);
  expect(html).toMatch(/<bdi[^>]+dir="ltr"/);
  expect(html).toMatch(/₪/);
  expect(html).not.toMatch(/\*\*/);
});
