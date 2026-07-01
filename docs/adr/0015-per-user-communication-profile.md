# ADR-0015: Per-user Communication Profile as a tone axis orthogonal to persona

**Status:** Proposed
**Date:** 2026-07-01
**Source:** Extends [ADR-0007](0007-persona-layer.md) (persona layer) and lives behind the [ADR-0004](0004-repository-interface-seam.md) repository seam.
Builds on `server/src/ai/v2/persona.ts` (`buildPersonaSection`, `SERIOUS_TONE_RULE` lines 35-43), `server/src/ai/v2/prompt.ts` (`buildSystemPrompt`, persona injected at line 74, `[MONEY]` at 112-126), the two v2 turn entry points in `server/src/ai/v2/hitl.ts` (`invokeV2Resumable` lines 207-256, `streamAssistantV2` lines 303-353), and `PersonalDetails.dateOfBirth` (`server/src/repositories/types.ts:89`).
Not yet implemented: the seams it extends are live, but the profile itself is forthcoming; a design/implementation plan is tracked on a feature branch and this ADR flips to Accepted when that work lands.

---

## Context

The persona layer (ADR-0007) gives the assistant four distinct identities selected by `assistantId`, but within a persona the voice is identical for every user.
Product wants the assistant to adapt *how* it speaks to the person in front of it: an elderly user who benefits from plain, patient wording; a user who wants brevity; a user who dislikes slang.

The obvious first move is to add more personas, but "adapt for an elderly user" is not a new character.
It is a modulation of register, complexity, and pace that should apply *across* all four personas, so a warm Chaya can also keep it simple and an analytical Yohai can stay concise.
Persona answers "who speaks"; this feature answers "how they speak to this user", and the two are independent.

The decision was therefore threefold: whether per-user tone belongs on the existing persona axis or a new orthogonal one; where the per-user state should live so it is durable, user-editable, and safe; and how a self-evolving tone layer can never become a channel for a user to rewrite the assistant's safety or money rules.

## Decision

A per-user **Communication Profile** is introduced as a new axis, orthogonal to persona.
`assistantId` still selects the character; the profile modulates the register of whichever persona is active.
The four personas are unchanged, so adding the profile is not adding a persona.

The profile is a small, bounded shape: structured dials (formality, verbosity, complexity, humor, pace) plus a capped list of free-text notes, each entry tagged with a provenance of `seeded`, `learned`, or `user_set`.

It is first-class per-user data behind the repository seam (ADR-0004), not AI scratch memory.
It is a repository record with Mongo and Postgres implementations and contract parity, read and written through a service, and exposed for view, edit, and reset through an authenticated `/api/accounts` route so the user can always see and correct what the assistant has learned.

It is seeded from user details as the *initial* behavior only.
On first read, when `PersonalDetails.status` is `"provided"` and `dateOfBirth` is set, an age-derived prior sets gentle defaults with provenance `seeded`.
Age never hard-locks tone.

It evolves conservatively.
A post-turn detector in the v2 entry points updates a dial or note only on an explicit statement ("keep it short") or a strong repeated signal.
`learned` and `user_set` entries outrank `seeded`, so observed behavior and explicit settings override the age prior over time.

It is injected as a `[HOW TO TALK TO THIS USER]` block placed immediately after `buildPersonaSection` in `buildSystemPrompt`.
Because the `[MONEY]` rules render textually *after* this block, the block gains no precedence from position and must not rely on it.
The block explicitly defers, in its own wording, to `SERIOUS_TONE_RULE`, the `[MONEY]` and `[STYLE]` rules, and the `[LANGUAGE]` mirroring rule, and its free-text notes render as inert description, never as directives, and never inject Hebrew when the user is writing another language.

The ADR-0007 safety boundary is preserved and extended: the profile changes voice, never implementation.
The allow-list is enforced in the type and the write path, a Zod schema on the HTTP route and a typed clamp in the service, so a statement like "always approve my transfers" maps to no dial and is dropped.
It can never become a written instruction, touch tools, confirmation, limits, or money.

Scope is v2 only.
v1 has no per-user durable memory and is rollback-only (ADR-0008), and v2 is the default (`VIRLY_AI_GRAPH_VERSION` default `v2`), so the live path is covered and v1 parity is deferred.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Add "elderly" or tone-flavored entries as new persona ids | Conflates two axes: every character times every adaptation is O(N*M) and re-opens ADR-0007's per-persona safety review. Tone is a modulation, not an identity. |
| Store the profile in the v2 AI long-term Store (`ai_memory_store`), beside counterparties and facts | The Store's `preferences` slot is dormant and unwired, `resolveLongTermStore()` returns `undefined` in DB-free and eval mode so it is not always available, and a Settings HTTP route reaching into AI memory breaks the routes -> services -> repositories seam. The repository seam is durable, always available, and contract-tested. |
| Auto-force a simplified tone from age with no consent | Patronizing and presumptuous (age is a weak proxy for preference) and function creep on a DOB collected for KYC. Age seeds a prior only; behavior and explicit settings override it. |
| A second LLM pass that rewrites replies to a target reading level | Doubles latency and cost and fights v2's one-pass, in-character design; tone belongs in the single system prompt, not a post-hoc rewrite. |
| Merge the dials into the existing `UserPreferences` record and `upsertPreferences` writer | `UserPreferences` carries `confirmAboveAmount` (money-adjacent) and the writer is a blind spread-merge, so a shared writer could let a tone update mutate a money field. The profile gets its own record and an allow-listed writer. |

## Status

Proposed.
The seams this decision extends are live (the persona layer, the repository seam, the two v2 entry points), but the Communication Profile itself is not yet implemented.
This ADR flips to Accepted when the implementation plan lands.

## Consequences

**Positive:** per-user tone adaptation scales O(1) on a new axis without touching the four personas or their safety review; the profile is durable, user-editable, and contract-tested like other app data; the age seed is a respectful default rather than a lock; the allow-list keeps the ADR-0007 voice-not-implementation boundary intact.

**Negative / trade-offs:** a new repository record means interface plus Mongo plus Postgres plus contract work; the profile block sits inside the prompt-cacheable prefix, so it changes the cache key per user and per edit; the strongest tone-safety guarantee, that the model actually flattens tone on serious turns, is only proven by the opt-in live evals, so CI must lean on the deterministic present-positioned-and-allow-listed assertions.

**Neutral / follow-on work:** v1 parity is purely additive if ever needed; the conservative learned-update detector can grow richer signals over time; a future ADR could relocate the profile into the AI long-term Store if that tier gains an always-on, seam-friendly access path. See ADR-0007 for the persona boundary this extends, ADR-0004 for the repository seam, and ADR-0008 for the v1/v2 split that scopes this to v2.
