# Virly AI Assistant LangSmith Contract

This document records the contract used by the LangSmith dataset in
`server/src/ai/evals/langsmith/assistant-langsmith.examples.json`. It is based on
the current code paths, not on a generic LangGraph chat shape.

## External Entry Points

- `server/src/app.ts` mounts the assistant router at `/api/ai`.
- `POST /api/ai/chat` validates `{ message, conversationId?, assistantId? }`,
  derives `userId` from `requireAuth`, creates `conversationId` and `requestId`
  when absent, and calls the assistant runtime.
- `POST /api/ai/chat/stream` accepts the same chat body and emits SSE
  `status`, additive v2 `token/status/block`, and final `result` events.
- `POST /api/ai/confirmations/:id` is the confirmation/deny endpoint. In v2 it
  resumes a checkpointed graph with `Command({ resume })`; otherwise it falls
  back to the deterministic pending-transfer service.
- The client calls these endpoints through `client/src/lib/api.ts`; the UI sees
  `AiChatResponse`, not raw graph state.

All three HTTP routes are behind `requireAuth`. POST requests require the auth
cookie and a matching `X-CSRF-Token`; unauthenticated or invalid-CSRF requests
are rejected before the graph runs.

## Runtime Input

The service-level assistant contract is `RunAssistantInput`:

```ts
{
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId?: AssistantId;
  message: string;
}
```

The LangSmith examples use ordered sequences of these exact objects under
`inputs.turns[*]`. Single-turn examples contain one item. Multi-turn examples use
the same `conversationId` so the target function can load and save conversation
memory between turns.

Production HTTP adds context around this input:

- `userId` comes from the verified JWT payload, never from the body.
- `conversationId` is user-provided or generated per chat request.
- `requestId` is `x-request-id` or a generated UUID.
- `assistantId` defaults to `oshri` when omitted.
- `message` is trimmed and limited to 1-2000 characters by the route schema.

## Graph Selection

`runAssistant` dispatches by `config.ai.graphVersion`. The current default is
`v2` (`VIRLY_AI_GRAPH_VERSION=v1` rolls back to v1).

The v1 graph is deterministic-first and returns `RunAssistantResult` directly.
The v2 non-streaming API route uses `invokeV2Resumable`, whose graph shape is:

```text
prepare -> agent <-> tools -> finalize -> transferGate? -> executeTransfer? -> persist
```

For v2 transfer preparation, `transferGate` interrupts and checkpoints when a
confirmation card exists. The chat response returns the card; money movement is
only reachable after the authenticated confirmation endpoint resumes the same
`thread_id = conversationId`.

## State And Config

Raw v1 graph state contains more than the API returns: `messages`,
`counterpartyMemory`, normalized request slots, `userRequest`, resolved
references, transfer drafts, executed tool results, clarification state, response
style context, response blocks, and optional debug trace.

V2 is message-centric. Its graph state contains `messages`, `responseMessage`,
`confirmation`, `clarification`, `supersededConfirmationId`, and resume/transfer
execution fields. Per-turn identity and dependencies are carried through
LangGraph `config.configurable`: `userId`, `conversationId`, `assistantId`,
current message, time zone, tool executors, transfer services, pending
confirmation memory, and the mutable `turnOutcome`.

This distinction matters for evaluations: graph state, service output, HTTP JSON,
and UI-visible data are related but not identical.

## Returned Output

The service-level result is `RunAssistantResult`:

```ts
{
  message: string;
  responseMessage: string;
  responseFormatVersion: AssistantResponseFormatVersion;
  responseBlocks?: AssistantResponseBlock[];
  conversationId: string;
  assistantId: AssistantId;
  intent: AssistantIntent;
  toolCalls: AssistantToolName[];
  toolResults?: { toolName: AssistantToolName; status: AiToolStatus }[];
  clarification?: ClarificationRequest;
  confirmation?: TransferConfirmation;
  supersededConfirmationId?: string;
  refusalReason?: string;
}
```

`toChatResponse` maps that service result into `AiChatResponse`. Streaming wraps
the same final chat response under a `result` SSE event. V2 streaming also emits
additive token/status/block events before that final result.

## LangSmith Shape

Official LangSmith docs define examples as inputs, optional reference outputs,
and metadata; only `inputs` are passed to the target function. The dataset
therefore stores semantic reference outputs under `outputs.expectedTurns` and
keeps filtering/categorization fields under `metadata`.

The experiment target returns:

```ts
{
  turns: Array<{
    index: number;
    input: RunAssistantInput;
    result: RunAssistantResult;
  }>
}
```

Evaluators compare this structure to `outputs.expectedTurns`, checking semantic
and structural behavior: intent, tool calls, confirmation/clarification presence,
confirmation amount/recipient, required facts, prohibited claims, and safety
boundaries. Exact assistant prose is intentionally not a reference output.

## Documentation Sources

- LangSmith evaluation concepts: datasets/examples/metadata, offline vs online
  evaluation, experiments, and evaluators:
  https://docs.langchain.com/langsmith/evaluation-concepts
- LangSmith example data fields:
  https://docs.langchain.com/langsmith/example-data-format
- LangSmith evaluation quickstart and target/evaluator flow:
  https://docs.langchain.com/langsmith/evaluation-quickstart
- LangSmith multi-turn online evaluator requirements:
  https://docs.langchain.com/langsmith/online-evaluations-multi-turn
- LangGraph interrupts, `thread_id`, `__interrupt__`, and `Command({ resume })`:
  https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangGraph streaming and subgraph stream behavior:
  https://docs.langchain.com/oss/javascript/langgraph/streaming
