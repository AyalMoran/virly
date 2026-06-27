# 05 — Structured-response block registry

**Strength: Worth exploring.** A concrete, pattern-driven refactor across server
and client. Pairs naturally with brief 02 (it consumes the contract SSOT) and is
the *output* counterpart to brief 04's *input* core.

---

## Thesis

A "structured response block" (the typed UI payloads the assistant returns:
`account_summary`, `transaction_list`, `transfer_confirmation`, …) is **one
concept** whose facets are scattered across (at least) **five** places that must
be edited in lockstep for every block type:

1. **Server type union** — `assistantResponseBlockTypeValues` /
   `AssistantResponseBlockType` in `server/src/ai/responseBlocks.ts:19,35`.
2. **Server builders** — ~10 `build*Block(s)` functions in `responseBlocks.ts`
   (1,046 LOC), `buildAssistantResponseBlocks` at :936.
3. **v2 tool→block mapping** — `buildBlocksFromResult` in
   `server/src/ai/v2/blocks.ts:78` (a `switch` on tool name producing blocks).
4. **Client type union + interfaces** — `AssistantResponseBlockType` and the
   per-block interfaces in `client/src/lib/types.ts:403` (within the 713-LOC file).
5. **Client renderer** — the `renderBlock` `switch (block.type)` in
   `client/src/components/assistant/AssistantBlocks.tsx:1032` (1,239 LOC),
   one `case` per block type (13 today), plus a transfer-status sub-switch.

The block system's *interface* (a discriminated union of block shapes) is small
and elegant; its *implementation* is smeared so that the knowledge of "what a
`transfer_quote` block is" lives in five files. That is a **shallow scatter**: low
locality (one concept, five edit sites), and the only thing keeping the five
aligned is discipline plus the sync tests in `aiSafety.test.ts`.

## Affected modules

- `server/src/ai/responseBlocks.ts` (1,046) — union + builders.
- `server/src/ai/v2/blocks.ts` — tool→block mapping (`buildBlocksFromResult`).
- `server/src/ai/toolResults.ts` / `state.ts` — `createToolResult`,
  `getToolDisplayData` (the "Tool Result Block Mapping" cluster).
- `client/src/lib/types.ts` — client block union + interfaces.
- `client/src/components/assistant/AssistantBlocks.tsx` (1,239) — `renderBlock`.

## Evidence of the friction

- 13 block types, each requiring a server builder, a client renderer `case`, a
  union member on **both** sides, and (often) a v2 tool-mapping `case` — confirmed
  by the grep map above.
- `AssistantBlocks.tsx` is **1,239 LOC** and `responseBlocks.ts` is **1,046 LOC**;
  most of both is per-block code that grows every time a block is added.
- `aiSafety.test.ts` exists in part to assert the unions "stay in sync" — i.e. the
  scatter is real enough to need a guard.

### Deletion test

Delete the `transfer_quote` `case` from the client `renderBlock`. Nothing else
breaks at compile time, but the block silently renders as nothing — and the
*definition* of `transfer_quote` still lives in four other files. A concept whose
removal from one site leaves four orphaned definitions is a concept that wants a
single home (one registry entry per block type), not five parallel switch arms.

## Target shape

Define each block type **once per side** as a registry entry, and drive the
builders/renderers/mapping from the registry instead of parallel switches.

Server registry (one entry per block type):
```ts
// server/src/ai/blocks/registry.ts
export const blockRegistry = {
  account_summary: {
    schema: accountSummaryBlockSchema,            // ← from the contract SSOT (brief 02)
    fromTool: { getAccountBalance: buildAccountSummaryBlocks }, // replaces v2/blocks switch
  },
  transaction_list: { schema: …, fromTool: { getRecentTransactions: …, searchTransactions: … } },
  // …one entry per type
} satisfies Record<AssistantResponseBlockType, BlockDef>;
```
`buildBlocksFromResult` becomes a lookup (`blockRegistry[type].fromTool[toolName]`)
rather than a hand-maintained switch; the union type is *derived from the registry
keys* so it can't drift from the builders.

Client registry (one entry per block type):
```ts
// client/src/components/assistant/blockRegistry.tsx
export const blockRenderers: Record<AssistantResponseBlockType, BlockRenderer> = {
  account_summary: AccountSummaryBlock,
  transaction_list: TransactionListBlock,
  // …each renderer in its own file
};
```
`renderBlock` becomes `const R = blockRenderers[block.type]; return <R block={block}/>`,
and the giant component splits into one file per block renderer.

Both registries are keyed by the **same** `AssistantResponseBlockType` — ideally
the one from the contract SSOT (brief 02) — so `satisfies Record<…>` makes "every
block type has a builder and a renderer" a **compile-time** guarantee, retiring
the runtime sync tests.

## Benefits (locality + leverage + tests)

- **Locality.** Everything about a block type is reachable from its registry entry
  (schema, builder, tool mapping) and its one renderer file. Adding a block = add
  one server entry + one renderer file; the compiler enforces completeness.
- **The interface is the test surface.** Each renderer is a small component tested
  in isolation (fits the existing no-jsdom `renderToStaticMarkup` harness); each
  builder is tested via its registry entry.
- **Two 1,000+ LOC files dissolve** into many small, single-responsibility files —
  a big AI-navigability win.
- **Sync-by-construction.** `satisfies Record<AssistantResponseBlockType, …>`
  replaces "remember to update five files + a test" with a type error if you don't.

## Before / After

```
BEFORE — one concept, five lockstep edit sites
  server union ─┐  server builders ─┐  v2 tool→block switch ─┐
                └──────── transfer_quote ───────────────────┘
  client union ─┐  client renderBlock switch (1,239 LOC) ────┘
  alignment enforced by discipline + aiSafety sync tests

AFTER — one registry entry per type, completeness checked by the compiler
  AssistantResponseBlockType (from contract SSOT, brief 02)
        │ keys
   ┌────┴──────────────┐
  server blockRegistry  client blockRenderers
  {type → schema,       {type → <Renderer/>}   each renderer in its own file
        builder, fromTool}
  satisfies Record<…>  ⇒ missing builder/renderer = compile error
```

## Implementation outline (for the planning agent)

1. **Prefer doing brief 02 first** so the block union has a single source; if not,
   keep the server and client unions as-is and make each registry `satisfies
   Record<ThatUnion, …>`.
2. **Client first (lower risk):** extract each `renderBlock` `case` into its own
   component file; build `blockRenderers` map; reduce `renderBlock` to a lookup.
   Verify with the existing client tests + a snapshot per renderer.
3. **Server:** introduce `blockRegistry`; convert `buildBlocksFromResult`'s switch
   to a registry lookup; move each `build*Block` next to its entry. Keep
   `buildAssistantResponseBlocks` as the orchestrator that calls the registry.
4. **Derive the union from the registry keys** (or assert equality with the SSOT
   union) and **delete the now-redundant sync assertions** in `aiSafety.test.ts`
   (keep the genuine safety ones).
5. Add a "every block type has a builder + renderer" type-level check (the
   `satisfies` does most of this).

## Risks / constraints

- **Keep the wire format identical.** `assistantResponseFormatVersion` and block
  shapes must not change — this is an internal reorganization, not a contract bump
  (contract changes are brief 02).
- The transfer-confirmation block has the most behaviour (status sub-states:
  confirming/denying/confirmed/denied/superseded/failed at
  `AssistantBlocks.tsx:836`); give it a slightly richer registry entry rather than
  forcing it into the simplest shape.
- Don't regress the streaming path: v2 emits `block` SSE events the moment a tool
  returns (`mapStreamChunk`); the registry lookup must produce the same blocks the
  stream already emits.

## Definition of done

- Adding a block type touches exactly one server registry entry + one client
  renderer file; omitting either is a compile error.
- `AssistantBlocks.tsx` and `responseBlocks.ts` are decomposed into per-block
  files; neither remains a four-figure-LOC switch.
- Wire format unchanged; streaming + safety tests pass.

## Out of scope / related

- **02** — the block *type* SSOT; this brief is the block *behaviour* (builders +
  renderers) co-location. Do them together for maximum effect.
- **04** — the query/tool core that *produces the data* a block renders; this brief
  is the rendering/shaping side.
- **06** — general client module cohesion; this brief carves out the block
  subsystem specifically.
