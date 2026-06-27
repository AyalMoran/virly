# ADR-0007: Four-persona layer for the AI assistant

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/ai/architecture.md`](../ai/architecture.md) — §4 "Persona layer". Code: `server/src/ai/assistants.ts` (`assistantIds`, `assistantPersonalities`); `server/src/ai/v2/persona.ts` (`buildPersonaSection`).

---

## Context

A banking assistant that always speaks in the same neutral voice is on-brand but
bland; a configurable persona system lets product offer distinct assistant
identities without changing the underlying tool or safety logic. The question
was whether persona selection should change the implementation (tool set, safety
rules, graph version) or only the voice. Conflating the two would make it
impossible to deploy a new persona without re-testing the entire safety surface.

## Decision

Four personas are registered in `server/src/ai/assistants.ts`: `oshri` (the
default, `DEFAULT_ASSISTANT_ID`), `chaya`, `yehuda`, and `yohai`. The
`assistantId` field in a chat request selects a persona (voice, phrase pack,
`globalGuidance`) — it does **not** change the implementation, tool set, or
graph version. Both v1 and v2 honour every persona id. In v2, `buildPersonaSection`
injects a `[PERSONA]` block into the system prompt; in v1, `responseStyle.ts`
applies the equivalent persona/style context in the `buildResponseStyle` node.
A hard `SERIOUS_TONE_RULE` overrides in-character voice on insufficient funds,
failed transfers, security-sensitive requests, or missing transfer details —
personality never obscures a number, warning, or refusal.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| One persona per assistant implementation | Multiplies implementation surface; safety tests would need full duplication per persona; scaling to more personas is O(N) cost instead of O(1). |
| Persona selection changes the tool set | Introduces an attack surface: a persona swap could disable safety tools. The separation between "who speaks" and "how the graph runs" is an intentional security boundary. |

## Status

Accepted — four assistants are live in `assistants.ts`. Verified: `assistantIds`
array is `["oshri", "chaya", "yehuda", "yohai"]` (four entries). The
`assistantId` → persona mapping and the `SERIOUS_TONE_RULE` are both in the
live codebase.

## Consequences

**Positive:** New personas cost a configuration entry, not a new implementation;
safety guarantees are independent of persona; locale-aware phrase packs mean
Hebrew phrases are used only when the user writes Hebrew (language mirroring
preserved).

**Negative / trade-offs:** Phrase-pack quality requires per-persona review;
persona identity can drift if `globalGuidance` and phrase packs are not
maintained together.

**Neutral / follow-on work:** Adding a fifth persona is purely additive.
Persona-level A/B testing (routing different users to different personas) is
possible without any implementation changes.
