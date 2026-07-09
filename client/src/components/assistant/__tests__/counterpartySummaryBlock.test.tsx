// client/src/components/assistant/__tests__/counterpartySummaryBlock.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantBlocks } from "../AssistantBlocks";
import type { AssistantResponseBlock } from "../../../lib/types";

const block: AssistantResponseBlock = {
  id: "cp-1",
  type: "counterparty_summary",
  counterpartyName: { text: "Dan Levi", dir: "ltr" },
  counterpartyEmailMasked: "d***@example.com",
  sentTotal: { amount: 400, currency: "ILS", formatted: "₪400.00" },
  receivedTotal: { amount: 250, currency: "ILS", formatted: "₪250.00" },
  net: { amount: 150, currency: "ILS", formatted: "₪150.00" },
  netDirection: "sent",
  transactionCount: 7
};

test("counterparty_summary renders a bento grid with identity, totals, and count", () => {
  const html = renderToStaticMarkup(<AssistantBlocks blocks={[block]} locale="en-US" />);

  expect(html).toMatch(/Dan Levi/);
  expect(html).toMatch(/d\*\*\*@example\.com/);
  expect(html).toMatch(/You sent/);
  expect(html).toMatch(/You received/);
  expect(html).toMatch(/Net sent/);
  expect(html).toMatch(/₪400\.00/);
  expect(html).toMatch(/₪250\.00/);
  expect(html).toMatch(/Transactions/);
  expect(html).toMatch(/>7</);
  expect(html).toMatch(/grid-cols-2/);
});

test("net direction 'received' and 'even' change the net label", () => {
  const received = renderToStaticMarkup(
    <AssistantBlocks blocks={[{ ...block, netDirection: "received" }]} locale="en-US" />
  );
  expect(received).toMatch(/Net received/);

  const even = renderToStaticMarkup(
    <AssistantBlocks blocks={[{ ...block, netDirection: "even" }]} locale="en-US" />
  );
  expect(even).toMatch(/Even/);
});
