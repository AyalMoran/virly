# Counterparty Summary Bento Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6h249mpF4hMf9GFM` - "create a nicer summary card for counterparty summary" (description: "maybe use a bento card").

**Goal:** When the AI assistant answers a counterparty-history question, render a structured bento-style card (you sent / you received / net / transaction count) instead of the current plain prose sentence.

**Architecture:** Today `getCounterpartySummary` (`server/src/ai/tools/getCounterpartySummary.ts`) returns totals in `result.data` (`totalSent`, `totalReceived`, `net`) and labels in `metadata` (`recordCount`, `maskedLabel`, `displayName`), but `buildBlocksFromResult` in `server/src/ai/v2/blocks.ts` has NO case for it, so the answer reaches the user as prose only.
This plan adds a new `counterparty_summary` block type to the shared block union, a v2 builder case that maps the tool result into it, and a client `CounterpartySummaryCard` in `AssistantBlocks.tsx` rendering a 2x2 bento grid in the assistant's existing Tailwind card language.
Scope note: v2 is the default graph (ADR 0008); the v1 graph keeps emitting prose for this tool and is untouched.

**Tech Stack:** TypeScript block union (server `responseBlocks.ts` + client `types.ts`), v2 block builder, React card in `AssistantBlocks.tsx`, Jest (native ESM) on both workspaces, Storybook fixture + story, `openapi.yaml` schema.

## Global Constraints

- Server imports carry `.js` specifiers (NodeNext ESM); client imports do not.
- Client tests: native-ESM Jest, `testEnvironment: "node"`, `renderToStaticMarkup`, no jsdom; files in co-located `__tests__/` folders.
- All user-facing text in blocks uses `LocalizedText` (`{ text, dir? }`) and money uses `AssistantMoneyValue` (`{ amount, currency, formatted? }`) for RTL safety.
- Currency is ILS at the tool layer; `money(...)` in `v2/blocks.ts` already defaults to ILS.
- Keep the `ai/__tests__/aiSafety.*` suites green (safety net for the AI layer).
- Never use emojis anywhere.

## Approach & rationale

Options considered:

1. **New `counterparty_summary` block type (chosen).** Mirrors how every other structured answer works (`account_summary`, `transaction_stats`, ...); client owns presentation; typed end-to-end; testable in both workspaces.
2. Reuse `transaction_stats` with `items`. No new type, but loses the counterparty identity (name, masked email) and the bento layout hook; the card would stay a generic key-value list. Rejected.
3. Markdown-format the prose better. No structure, no RTL-safe money rendering, no reuse. Rejected.

The builder reads totals from `result.data` (authoritative, already produced by the deployed tool) and labels from `metadata`, following the existing `txItemFromData` defensive-read precedent in `v2/blocks.ts`, so no tool change is needed.
Net sign convention (verified in the tool): `net = totalReceived - totalSent`, so positive means the user received more.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/ai/responseBlocks.ts` (modify) | Add `"counterparty_summary"` to `assistantResponseBlockTypeValues`, define `CounterpartySummaryBlock`, add it to the `AssistantResponseBlock` union export. |
| `server/src/ai/v2/blocks.ts` (modify) | New `case "getCounterpartySummary"` in `buildBlocksFromResult`. |
| `server/src/ai/v2/__tests__/blocks.test.ts` (modify) | Builder tests (happy path + empty history). |
| `client/src/lib/types.ts` (modify) | Mirror the new union member + `"counterparty_summary"` in `AssistantResponseBlockType`. |
| `client/src/components/assistant/AssistantBlocks.tsx` (modify) | `CounterpartySummaryCard` (bento grid) + dispatch case. |
| `client/src/components/assistant/__tests__/counterpartySummaryBlock.test.tsx` (create) | Card rendering tests. |
| `client/.storybook/fixtures/assistant.ts` (modify) | `assistantCounterpartySummaryBlock` fixture. |
| `client/src/components/assistant/__stories__/AssistantBlocks.stories.tsx` (modify) | `CounterpartySummary` story. |
| `openapi.yaml` (modify) | Block schema + union entry. |

---

## Task 1: Server block type + v2 builder case (TDD)

**Files:**
- Modify: `server/src/ai/responseBlocks.ts`
- Modify: `server/src/ai/v2/blocks.ts`
- Test: `server/src/ai/v2/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `AssistantResponseBlockBase`, `LocalizedText`, `AssistantMoneyValue` (all already in `responseBlocks.ts`), `money()` / `blockId()` / `getToolDisplayData` (already in `v2/blocks.ts`), the `makeResult` helper already defined in `blocks.test.ts`.
- Produces:
  - Server type:

```ts
export type CounterpartySummaryBlock =
  AssistantResponseBlockBase<"counterparty_summary"> & {
    counterpartyName: LocalizedText;
    counterpartyEmailMasked?: string;
    sentTotal?: AssistantMoneyValue;
    receivedTotal?: AssistantMoneyValue;
    net?: AssistantMoneyValue;
    netDirection?: "sent" | "received" | "even";
    transactionCount: number;
  };
```

  - Builder behavior: `buildBlocksFromResult("getCounterpartySummary", result)` returns `[CounterpartySummaryBlock]` when totals exist, `[]` otherwise.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/ai/v2/__tests__/blocks.test.ts` (it already imports `buildBlocksFromResult` and defines `makeResult(toolName, status, metadata, data?)`):

```ts
// ---------------------------------------------------------------------------
// buildBlocksFromResult — getCounterpartySummary
// ---------------------------------------------------------------------------

describe("buildBlocksFromResult — getCounterpartySummary", () => {
  test("builds a counterparty_summary block from totals data and metadata labels", () => {
    const result = makeResult(
      "getCounterpartySummary",
      "ok",
      {
        recordCount: 7,
        amount: -150,
        counterpartyEmail: "dan@example.com",
        maskedLabel: "d***@example.com",
        displayName: "Dan Levi"
      },
      { totalSent: 400, totalReceived: 250, net: -150 }
    );

    const blocks = buildBlocksFromResult("getCounterpartySummary", result);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe("counterparty_summary");
    if (block.type !== "counterparty_summary") {
      return;
    }
    expect(block.counterpartyName.text).toBe("Dan Levi");
    expect(block.counterpartyEmailMasked).toBe("d***@example.com");
    expect(block.sentTotal).toEqual({ amount: 400, currency: "ILS" });
    expect(block.receivedTotal).toEqual({ amount: 250, currency: "ILS" });
    expect(block.net).toEqual({ amount: 150, currency: "ILS" });
    expect(block.netDirection).toBe("sent");
    expect(block.transactionCount).toBe(7);
  });

  test("falls back to the masked label when no display name exists", () => {
    const result = makeResult(
      "getCounterpartySummary",
      "ok",
      { recordCount: 2, maskedLabel: "d***@example.com" },
      { totalSent: 10, totalReceived: 0, net: -10 }
    );

    const blocks = buildBlocksFromResult("getCounterpartySummary", result);
    expect(blocks).toHaveLength(1);
    if (blocks[0].type === "counterparty_summary") {
      expect(blocks[0].counterpartyName.text).toBe("d***@example.com");
    }
  });

  test("builds nothing when the result carries no totals (empty history)", () => {
    const result = makeResult("getCounterpartySummary", "empty", { recordCount: 0 });
    expect(buildBlocksFromResult("getCounterpartySummary", result)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- src/ai/v2/__tests__/blocks.test.ts`
Expected: FAIL - the type comparison `block.type === "counterparty_summary"` does not typecheck yet and the builder returns `[]` for the happy path.

- [ ] **Step 3: Add the block type to `responseBlocks.ts`**

In `server/src/ai/responseBlocks.ts`:

1. Add `"counterparty_summary"` to the `assistantResponseBlockTypeValues` const array (after `"transaction_stats"`).
2. Add the `CounterpartySummaryBlock` type from the Interfaces section above, next to `TransactionStatsBlock`.
3. Add `CounterpartySummaryBlock` to the exported `AssistantResponseBlock` union (search for `export type AssistantResponseBlock =` in the same file).

- [ ] **Step 4: Add the builder case to `v2/blocks.ts`**

Inside the `switch (toolName)` in `buildBlocksFromResult`, after the `getTransactionStats` case:

```ts
    case "getCounterpartySummary": {
      const data = result.data as
        | { totalSent?: number; totalReceived?: number; net?: number }
        | null
        | undefined;
      const hasTotals =
        typeof data?.totalSent === "number" ||
        typeof data?.totalReceived === "number" ||
        typeof data?.net === "number";
      if (!hasTotals) {
        break;
      }
      const nameText =
        meta.displayName ?? meta.maskedLabel ?? meta.counterpartyEmail ?? "this counterparty";
      const net = typeof data?.net === "number" ? data.net : undefined;
      blocks.push({
        id: blockId("cpsummary"),
        type: "counterparty_summary",
        counterpartyName: { text: nameText },
        ...(meta.maskedLabel ? { counterpartyEmailMasked: meta.maskedLabel } : {}),
        ...(typeof data?.totalSent === "number" ? { sentTotal: money(data.totalSent) } : {}),
        ...(typeof data?.totalReceived === "number"
          ? { receivedTotal: money(data.totalReceived) }
          : {}),
        // Tool convention: net = totalReceived - totalSent, so positive = received more.
        ...(net !== undefined ? { net: money(Math.abs(net)) } : {}),
        ...(net !== undefined
          ? { netDirection: net > 0 ? "received" : net < 0 ? "sent" : "even" }
          : {}),
        transactionCount: meta.recordCount ?? 0
      });
      break;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:server -- src/ai/v2/__tests__/blocks.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck the server and keep the AI safety net green**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: no type errors, all suites (including `aiSafety.*` and `responseBlocks.test.ts`) PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/responseBlocks.ts server/src/ai/v2/blocks.ts server/src/ai/v2/__tests__/blocks.test.ts
git commit -m "feat(ai): counterparty_summary response block built from getCounterpartySummary"
```

---

## Task 2: Client type + bento card (TDD)

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/components/assistant/AssistantBlocks.tsx`
- Test: `client/src/components/assistant/__tests__/counterpartySummaryBlock.test.tsx`

**Interfaces:**
- Consumes: `AssistantCard`, `MoneyValue` (both already exported/defined inside `AssistantBlocks.tsx`), lucide icons.
- Produces: client union member (below) and `CounterpartySummaryCard` rendered by `renderBlock`.

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client -- counterpartySummaryBlock`
Expected: FAIL - the block object does not satisfy the `AssistantResponseBlock` union yet.

- [ ] **Step 3: Add the union member to `client/src/lib/types.ts`**

Add `| "counterparty_summary"` to `AssistantResponseBlockType`, and add this member to the `AssistantResponseBlock` union (next to the `transaction_stats` member):

```ts
  | {
      id: string;
      type: "counterparty_summary";
      title?: LocalizedText;
      counterpartyName: LocalizedText;
      counterpartyEmailMasked?: string;
      sentTotal?: AssistantMoneyValue;
      receivedTotal?: AssistantMoneyValue;
      net?: AssistantMoneyValue;
      netDirection?: "sent" | "received" | "even";
      transactionCount: number;
    }
```

- [ ] **Step 4: Implement `CounterpartySummaryCard` and the dispatch case**

In `client/src/components/assistant/AssistantBlocks.tsx`:

1. Add `Scale` and `UsersRound` to the existing `lucide-react` import (`ArrowUpRight`, `ArrowDownLeft`, `ReceiptText` are already imported).
2. Add the card component next to `TransactionStatsCard`:

```tsx
function CounterpartySummaryCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "counterparty_summary" }>;
  locale?: string;
}) {
  const netLabel =
    block.netDirection === "sent"
      ? "Net sent"
      : block.netDirection === "received"
        ? "Net received"
        : "Even";

  const tiles = [
    ...(block.sentTotal
      ? [
          {
            key: "sent",
            label: "You sent",
            icon: <ArrowUpRight className="h-3.5 w-3.5" />,
            value: <MoneyValue value={block.sentTotal} locale={locale} />,
          },
        ]
      : []),
    ...(block.receivedTotal
      ? [
          {
            key: "received",
            label: "You received",
            icon: <ArrowDownLeft className="h-3.5 w-3.5" />,
            value: <MoneyValue value={block.receivedTotal} locale={locale} />,
          },
        ]
      : []),
    ...(block.net
      ? [
          {
            key: "net",
            label: netLabel,
            icon: <Scale className="h-3.5 w-3.5" />,
            value: <MoneyValue value={block.net} locale={locale} />,
          },
        ]
      : []),
    {
      key: "count",
      label: "Transactions",
      icon: <ReceiptText className="h-3.5 w-3.5" />,
      value: (
        <span dir="ltr" className="font-semibold">
          {block.transactionCount}
        </span>
      ),
    },
  ];

  return (
    <AssistantCard
      title={block.title ?? block.counterpartyName}
      subtitle={
        block.counterpartyEmailMasked
          ? { text: block.counterpartyEmailMasked, dir: "ltr" }
          : undefined
      }
      icon={<UsersRound className="h-3.5 w-3.5" />}
    >
      <div className="grid grid-cols-2 gap-2 p-3">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex min-w-0 flex-col gap-1 rounded-md border border-border/25 bg-background/60 px-2.5 py-2"
            style={{ textAlign: "start", overflowWrap: "anywhere" }}
          >
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {tile.icon}
              {tile.label}
            </span>
            <span className="text-[13px] font-semibold">{tile.value}</span>
          </div>
        ))}
      </div>
    </AssistantCard>
  );
}
```

3. Add the dispatch case inside `renderBlock` (after `case "transaction_stats"`):

```tsx
    case "counterparty_summary":
      return <CounterpartySummaryCard block={block} locale={props.locale} />;
```

> If the `₪400.00` assertions fail, check `MoneyValue` (defined near the top of `AssistantBlocks.tsx`): it should prefer the provided `formatted` string; adjust the test fixture to whatever `MoneyValue` actually renders for `{ amount, currency, formatted }`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:client -- counterpartySummaryBlock`
Expected: PASS.
Then: `npm run test:client` - the existing `assistantBlocks.test.tsx` must stay green.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/types.ts client/src/components/assistant/AssistantBlocks.tsx client/src/components/assistant/__tests__/counterpartySummaryBlock.test.tsx
git commit -m "feat(assistant): bento counterparty summary card"
```

---

## Task 3: Storybook fixture + story

**Files:**
- Modify: `client/.storybook/fixtures/assistant.ts`
- Modify: `client/src/components/assistant/__stories__/AssistantBlocks.stories.tsx`

**Interfaces:**
- Consumes: the client union member (Task 2).
- Produces: `assistantCounterpartySummaryBlock` fixture export.

- [ ] **Step 1: Add the fixture**

In `client/.storybook/fixtures/assistant.ts`, next to the other block fixtures:

```ts
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
```

- [ ] **Step 2: Add the story**

In `AssistantBlocks.stories.tsx`, add `assistantCounterpartySummaryBlock` to the fixtures import and add:

```tsx
/** Bento relationship summary for "what's my history with X". */
export const CounterpartySummary: Story = {
  args: { blocks: [assistantCounterpartySummaryBlock] },
};
```

- [ ] **Step 3: Verify Storybook builds and the story renders**

Run: `npm run build-storybook`
Expected: build succeeds (stories are also type-checked by `tsc -b`, since `__stories__/` is intentionally not excluded).
Optionally run `npm run storybook` and eyeball the new story at "AI Assistant/AssistantBlocks/CounterpartySummary".

- [ ] **Step 4: Commit**

```bash
git add client/.storybook/fixtures/assistant.ts client/src/components/assistant/__stories__/AssistantBlocks.stories.tsx
git commit -m "docs(storybook): counterparty summary block story"
```

---

## Task 4: OpenAPI contract

**Files:**
- Modify: `openapi.yaml`

- [ ] **Step 1: Add the block schema**

In `openapi.yaml`, locate the existing per-block schemas referenced by the `AssistantResponseBlock` union (the `transaction_stats` entry is the closest shape to copy).
Add, following the exact naming pattern of the neighboring block schemas:

```yaml
    AssistantCounterpartySummaryBlock:
      type: object
      required: [id, type, counterpartyName, transactionCount]
      properties:
        id:
          type: string
        type:
          type: string
          enum: [counterparty_summary]
        title:
          $ref: '#/components/schemas/LocalizedText'
        counterpartyName:
          $ref: '#/components/schemas/LocalizedText'
        counterpartyEmailMasked:
          type: string
        sentTotal:
          $ref: '#/components/schemas/AssistantMoneyValue'
        receivedTotal:
          $ref: '#/components/schemas/AssistantMoneyValue'
        net:
          $ref: '#/components/schemas/AssistantMoneyValue'
        netDirection:
          type: string
          enum: [sent, received, even]
        transactionCount:
          type: integer
```

Then add the new schema to the `AssistantResponseBlock` `oneOf` list (and to its discriminator mapping if one exists).
If the file names its block schemas differently (e.g. `TransactionStatsBlock` without the `Assistant` prefix), match that convention instead.

- [ ] **Step 2: Sanity-check the YAML**

Run: `node -e "const fs=require('fs'); const s=fs.readFileSync('openapi.yaml','utf8'); if(!s.includes('counterparty_summary')) throw new Error('missing'); console.log('ok')"`
Expected: `ok` (plus a visual diff review; the repo has no OpenAPI validator tooling).

- [ ] **Step 3: Commit**

```bash
git add openapi.yaml
git commit -m "docs(openapi): counterparty_summary assistant block schema"
```

---

## Task 5: End-to-end verification

**Files:** none.

- [ ] **Step 1: Ask the assistant a counterparty-history question**

Run `npm run dev:server` and `npm run dev:client`, log in as a seeded user (e.g. `sga@thunder.com` / `admin1234`), open the chat widget, and ask: "What's my history with <a counterparty you have transactions with>?".
Expected: the reply shows the bento card (name, masked email, You sent / You received / Net / Transactions) above or instead of relying on the prose sentence.

- [ ] **Step 2: Hebrew pass**

Ask: "מה ההיסטוריה שלי עם <counterparty>?".
Expected: the card renders with the numbers LTR-isolated inside the RTL bubble (the `AssistantCard` `dir` handling and `MoneyValue` cover this); the prose stays Hebrew.

- [ ] **Step 3: Full suites**

Run: `npm test && npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS.

---

## Self-Review

- **Spec coverage:** "nicer summary card" - Tasks 1-2 (structured block + card); "maybe use a bento card" - the 2x2 tile grid in Task 2; contract surfaces (Storybook, OpenAPI) - Tasks 3-4; behavior proven E2E in Task 5.
- **Placeholder scan:** the two "match existing convention" notes (OpenAPI schema naming, `MoneyValue` formatted preference) each point at a concrete in-repo anchor to copy from, not at unwritten work.
- **Type consistency:** `CounterpartySummaryBlock` fields (`counterpartyName`, `counterpartyEmailMasked`, `sentTotal`, `receivedTotal`, `net`, `netDirection`, `transactionCount`) are identical across server type (Task 1), builder output (Task 1), client union (Task 2), card usage (Task 2), fixture (Task 3), and OpenAPI schema (Task 4). `netDirection` semantics (positive net = received) are asserted in the Task 1 test.

## Open questions (answer later)

1. Should the v1 graph (`buildAssistantResponseBlocks` in `responseBlocks.ts`) also emit this block for its counterparty-summary intent, or is v2-only fine until v1 is retired?
2. Should the card include a "last interaction" line? The tool computes it for the prose but does not expose it in `data`/`metadata`; adding it means touching the tool result shape.
3. Should the block link to the counterparty profile page (`/users/:email`)? The block only carries the masked email by design (PII masking seam), so a link would need the full email deliberately added - defer to the email-masking design task (`6h249Qj89VXWqGJv`).
