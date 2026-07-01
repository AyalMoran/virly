# Plan: Security Model Doc

> **Deliverable:** `docs/security.md`
> **Type:** Architecture / reference
> **Audience:** Reviewers, new contributors, anyone touching auth or the AI surface
> **Status:** Done - shipped as `docs/security.md`.
> **Gap:** Table 2 #7 — CSRF, JWT cookies, route gating, enumeration-safe resend, and rate limiting are undocumented as a cohesive model.

## Why this doc
Security controls are spread across middleware, utils, the auth service, and the
client API layer. A single doc lets a reviewer confirm the defenses exist and
understand the threat model, instead of reverse-engineering it per PR.

## Source material (already in the repo)
- Auth: `server/src/middleware/auth.ts` (`requireAuth`), `middleware/roles.ts`, `services/auth.service.ts` (enumeration-safe resend, unverified-login gate)
- Cookies/CSRF: `server/src/middleware/cookies.ts`, `utils/{auth,token,session}.ts`, `server/src/authCookie.test.ts`; client `client/src/lib/api.ts` (CSRF header on unsafe methods, 401 handler)
- Hardening: `server/src/app.ts` (`helmet`, `cors`, `authLimiter`, `aiLimiter`, body-size limit)
- Password storage: `bcryptjs` in `auth.service.ts`
- AI safety: `server/src/ai/policy.ts`, `ai/tests/aiSafety.test.ts`, and the data-access seam (tools can only read the authenticated user's data)

## Phases
### Phase 1 — Threat model + control inventory
- [x] List assets (sessions, balances, PII, the AI money path) and the controls protecting each.
- [x] Inventory every control with its source file (auth, CSRF, rate limit, helmet headers, input validation via Zod).
- **Deliverable:** `docs/security.md` skeleton + control table.

### Phase 2 — Authentication & session
- [x] Document the HttpOnly JWT cookie + CSRF-token scheme, "Remember me" persistence, login/verify gates, and the 401 → clear-session client behaviour.
- [x] Document password hashing (bcrypt) and that no manual JWT validation is hand-rolled (uses `jsonwebtoken`).
- **Deliverable:** "authn & session" section.

### Phase 3 — Authorization & abuse resistance
- [x] Route gating (`requireAuth`, roles for admin video routes), ownerId-scoping enforced at the repository seam, enumeration-safe resend, and the two rate limiters (auth vs ai).
- **Deliverable:** "authz & abuse" section.

### Phase 4 — AI-specific safety
- [x] The "a tool can only read the authenticated user's own data" invariant (now enforced via repositories), the HITL gate (link to Transfers domain), and prompt/persona guardrails; reference `aiSafety.test.ts`.
- **Deliverable:** "AI safety" section + cross-links.

## Acceptance criteria
- [x] Every claimed control names the file that implements it and (where possible) the test that proves it.
- [x] The doc states explicitly that money movement always requires the HITL confirmation.
- [x] No invented controls — only what the code actually does.

## Related docs (link, don't duplicate)
[api-reference](../api-reference/api-reference-plan.md) · [transfers-domain](../transfers-domain/transfers-domain-plan.md) · [ai-architecture](../ai-architecture/ai-architecture-plan.md)

## Effort estimate
Medium (M).
