# Session Handoff

**Branch**: graph-v2
**When**: 2026-06-15 02:51:14 UTC
**Session**: a26c0a37-3894-45ef-ba9d-ea4878905fe1

## Summary
No regression — all three target scenarios still pass. The bug is fixed and verified.

## Fixed: the assistant reply now shows on the frontend

**Root cause** (found by tracing, not guessing): the frontend uses streaming (`/chat/stream` → `streamAssistantV2`), and under `graph.stream(streamMode: ["messages", …])` LangGraph runs the model in streaming mode, so the agent node's message is an **`AIMessageChunk`** — which is **not** `instanceof AIMessage`.

## Modified Files
- projects/bank-fs/server/.claude/HANDOFF.md

## Issues Fixed
- **Root cause** (found by tracing, not guessing): the frontend uses streaming (`/chat/stream` → `streamAssistantV2`), and under `graph.stream(streamMode: ["messages", …])` LangGraph runs the model in streaming mode, so the agent node's message is an **`AIMessageChunk`** — which is **not** `instanceof AIMessage`.
- **The fix:** a small streaming-robust helper `v2/messages.ts` (`isAiMessage`/`aiToolCalls`, matching both `AIMessage` and `AIMessageChunk` via `getType() === "ai"`), used in `finalize`, both `routeAgent` sites, `collectCalledToolNames`, and the summary.
