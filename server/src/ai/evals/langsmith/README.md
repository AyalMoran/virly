# LangSmith Assistant Dataset

This folder contains the LangSmith dataset artifacts for the Virly AI assistant.
They are service-level examples: each `inputs.turns[*]` is an exact
`RunAssistantInput` object. Multi-turn examples use repeated `conversationId`
values and the experiment runner provides an in-memory conversation store.

## Files

- `assistant-langsmith.examples.json` - LangSmith examples array.
- `schema.ts` - shared loader and schema validator.
- `validate-examples.ts` - local validation and behavior coverage summary.
- `sync-dataset.ts` - idempotent create/update script keyed by
  `metadata.example_id`.
- `run-experiment.ts` - minimal LangSmith experiment runner with a deterministic
  structural evaluator.

## Validate

```bash
npx tsx server/src/ai/evals/langsmith/validate-examples.ts
```

## Upload Or Sync

The script loads `.env` and `server/.env`; it requires `LANGSMITH_API_KEY`.
`LANGSMITH_PROJECT` is not required for dataset sync but should still be set so
new traces land in the expected project when experiments run.

```bash
npx tsx server/src/ai/evals/langsmith/sync-dataset.ts --dry-run
npx tsx server/src/ai/evals/langsmith/sync-dataset.ts \
  --dataset "Virly AI Assistant Contract"
```

The sync is non-destructive. It creates missing examples and updates changed
examples whose `metadata.example_id` already exists. It does not delete remote
examples.

## Run An Experiment

For the current default v2 graph, provide `OPENAI_API_KEY`, `VIRLY_AI_MODEL`, and
LangSmith credentials. To run the rollback v1 graph instead, set
`VIRLY_AI_GRAPH_VERSION=v1` before the command.

```bash
LANGSMITH_TRACING=true \
npx tsx server/src/ai/evals/langsmith/run-experiment.ts \
  --dataset "Virly AI Assistant Contract" \
  --experiment-prefix "virly-ai-assistant-contract"
```

The runner uses DB-free world tools and transfer services from the existing eval
harness. The default evaluator checks structural contract behavior:

- expected intent when asserted
- exact or included tool calls
- confirmation recipient and amount
- clarification presence and reply type
- superseded confirmation IDs
- required facts and prohibited claims in the final text

## Extend

Add a new object to `assistant-langsmith.examples.json` with a stable
`metadata.example_id`, one or more exact `RunAssistantInput` turns, and semantic
expectations under `outputs.expectedTurns`. Then run the validator before sync.
