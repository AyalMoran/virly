# Plan: AI Assistant Architecture (v1 + v2)

> **Deliverable:** `docs/ai/architecture.md` (+ optional `docs/ai/diagrams/`)
> **Type:** Architecture doc
> **Audience:** Anyone touching the assistant — backend, prompt, or eval work
> **Status:** Not started
> **Gap:** Table 2 #2 — the most complex subsystem has no architecture doc.

## Why this doc
`server/src/ai/` (v1 structured pipeline) and `server/src/ai/v2/` (LangGraph
agent with HITL, memory, persona) together are the highest-complexity, highest-
stakes code in the repo and are undocumented as a whole. New contributors can't
see how a chat message becomes a streamed, structured, persona-styled response
with a money-movement gate.

## Source material (already in the repo)
- Entry/routing: `server/src/routes/ai.routes.ts`, `ai/router.ts`, `ai/runAssistant.ts`
- v1 pipeline: `ai/graph.ts`, `ai/llm.ts`, `ai/assistants.ts`, `ai/responseBlocks.ts`, `ai/responseStyle.ts`, `ai/policy.ts`, `ai/tools/*` (~25 tools), `ai/state.ts`
- v2 agent: `ai/v2/{agent,graph,turn,hitl,model,persona,prompt,streamEvents}.ts`, `ai/v2/nodes/{prepare,transferGate,executeTransfer,finalize,persist}.ts`, `ai/v2/tools/*`
- Memory: `ai/v2/memory/{checkpointer,store,summary,loop}.ts` (uses `@langchain/langgraph-checkpoint-mongodb`)
- HITL state: `services/aiPendingTransfer.service.ts`
- Evals (link, don't duplicate): `ai/evals/`, `ai/evals/v2/README.md`, `ai/evals/langsmith/README.md`

## Phases
### Phase 1 — Scope map
- [x] One diagram: client → `ai.routes.ts` → router (v1 vs v2 selection) → graph nodes → tools → response blocks → SSE stream.
- [x] Table: which assistant id / request shape selects v1 vs v2.
- **Deliverable:** `architecture.md` skeleton with the top-level diagram.

### Phase 2 — v1 structured pipeline
- [x] Document the deterministic flow: intent → tool selection → response-block building → persona/style linting (`responseStyle.ts`) → deterministic fallback.
- [x] Explain the `AssistantResponseBlock` contract and where it's shared with the client (`client/src/lib/types.ts`).
- **Deliverable:** "v1 pipeline" section.

### Phase 3 — v2 LangGraph agent
- [x] Document the node graph (real topology: `prepare → agent ⇄ tools → finalize → (card? transferGate → executeTransfer : persist)`; plan's listed order corrected against `ai/v2/hitl.ts`), the HITL interrupt, and streaming events.
- [x] Document memory: thread checkpointer + long-term store, summarization loop, and the **Mongo-only** dependency (ties to the Postgres Phase 2 spec).
- **Deliverable:** "v2 agent" section with a node diagram.

### Phase 4 — Cross-cutting + safety
- [x] The HITL confirmation gate end-to-end (link to Transfers domain doc, don't duplicate).
- [x] Persona layer (4 personas), guardrails, and the `ai/tests/aiSafety.test.ts` invariants.
- [x] A short "how to add a tool" walkthrough (the highest-value contributor task).
- **Deliverable:** "safety & extension" section; link the evals READMEs.

## Acceptance criteria
- [x] A reader can trace a chat message from HTTP to streamed blocks for both v1 and v2.
- [x] The v1-vs-v2 selection rule is stated and matches the dispatch in `runAssistant.ts` / `ai.routes.ts` (keyed on `config.ai.graphVersion`; `ai/router.ts` is the intent classifier, not the v1/v2 switch).
- [x] Money movement is shown to require the HITL gate, never a tool acting alone.

## Related docs (link, don't duplicate)
[transfers-domain](../transfers-domain/transfers-domain-plan.md) · [postgres-phase2-spec](../postgres-phase2-spec/postgres-phase2-spec-plan.md) · [testing-evals](../testing-evals/testing-evals-plan.md) · `docs/frontend/areas/ai-assistant.md`

## Effort estimate
Large (L) — needs careful tracing; do the diagrams first to anchor the prose.
