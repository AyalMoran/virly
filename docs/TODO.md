## AI Assistant
- incorporate RAG
- Google drive MCP for upsale or policy
- more examples for LLM
- yohai daniel reply with timestamped info, "Based on x true to timestamp..."
- once token reset, Check how do the test always go to deterministic fallback. How come it doesnt go through the llm? do we want it to go through the llm?
- ~~add chaya and yohai.~~ ✅ Done — all four personas (Oshri, Chaya, Yehuda, Yohai) exist in `server/src/ai/assistants.ts`.
- improve prompt for the different personalities. oshri always says מה שנקרא out of nowhere.
- add dad jokes storage per intent.

- make users clickable with hover baloon with summary or user card

## Database
- split the verification tokens to a different collection or table
- ~~migrate to SQL~~ ✅ Done (Phase 1) — Postgres is selectable at boot via `VIRLY_DB_DRIVER=postgres` behind a repository seam. See [docs/superpowers/specs/2026-06-22-postgres-migration-design.md](superpowers/specs/2026-06-22-postgres-migration-design.md). (Phase 2: move LangGraph persistence off Mongo — still open.)
- 

## SocketIO
- implement and integrate


## User Page
- ~~add a User page where it shows information about the user with information in context of the viewing user.~~ ✅ Done — `UserProfilePage` is routed at `/users/:userId` (`client/src/features/users/UserProfilePage.tsx`) and shows the relationship in the viewing user's context (net balance, totals, recent transactions).