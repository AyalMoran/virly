# AI Evals

Evaluation harnesses for the Virly AI assistant.
Each eval is a script under `server/scripts/` that exits 0 on pass and non-zero on failure.

---

## Policy-RAG recall eval

`policy-rag.examples.jsonl` measures retrieval recall@k for the policy/loan knowledge base.
Each line is `{ "question", "expectedSourceRefs" }`, authored against the real ingested documents.
The documents are not committed to the repo; `sourceRef` is the Drive fileId (or local relative path), copied verbatim from the sync log.

Run (from repo root, after `rag:sync`):

    VIRLY_RAG_ENABLED=true npm --workspace server run eval:policy-rag

Flags:

- `--k=<n>` - top-k chunks to retrieve per query (default: value of `VIRLY_RAG_TOP_K`, typically 5).
- `--threshold=<0..1>` - recall fraction required for exit 0 (default: 1.0).

The runner prints a `✓`/`✗` line per question plus a summary line:

    recall@5 = 38/38 = 1.000

**When you add or rename a knowledge document** add or update a matching line in
`policy-rag.examples.jsonl` so every document stays covered.
Use the exact `source_ref` value from `knowledge_documents` (copy from the sync log, never retype or normalize).
Phrase questions like a customer would ask, not by quoting document headings.

---

## Conversation evals

See `cli.ts` and the `langsmith/` subfolder for the conversation-level evaluation harness.
Run via `server/src/ai/evals/cli.ts` (see `docs/testing.md`).
