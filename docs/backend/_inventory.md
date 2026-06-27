# Virly Backend — Module Inventory

This table is the source of truth for the backend reference. It drives the
per-area files in `areas/` and the appendices in `index.md`. Re-running the
documentation pass overwrites the per-area files cleanly; this inventory is what
each pass reads first — the server equivalent of
[`../frontend/_inventory.md`](../frontend/_inventory.md).

- **Backend root:** `server/`
- **Runtime:** Node + Express + TypeScript (ESM, `.js` import specifiers),
  `server/src/{app.ts,index.ts,db.ts,config.ts}`.
- **Layering:** `route → service → repository → driver`. Routes are thin
  controllers; services own logic + authorization; repositories own all data
  access behind a driver-agnostic seam (`mongo` default, `postgres` selectable
  at boot). See [`index.md`](index.md).
- **Persistence seam:** every model touch goes through
  `server/src/repositories/*`; a guard test
  (`server/src/repositories/no-direct-model-imports.test.ts`) fails the build if
  any file outside `repositories/mongo` or `ai/evals` imports `../models/*`.

## Layer legend

`route` · `service` · `repository` · `repository-seam` · `model` ·
`middleware` · `util` · `boot`

## Areas

Eleven areas group the files below. Each has one file under `areas/`:

| Area | File | Covers |
|------|------|--------|
| Auth | [areas/auth.md](areas/auth.md) | Registration, email verification, login/logout, session, CSRF. |
| Accounts/Users | [areas/accounts-users.md](areas/accounts-users.md) | Own account summary, personal details, public user profiles + relationship stats. |
| Transactions/Transfers | [areas/transactions-transfers.md](areas/transactions-transfers.md) | Ledger history, FX quote, money movement, fraud gate, held-transfer confirm/cancel (links the Transfers domain doc). |
| Exchange rates/FX | [areas/exchange-rates-fx.md](areas/exchange-rates-fx.md) | Current-rate snapshot, provider fetch/cache, quote math. |
| AI | [areas/ai.md](areas/ai.md) | Assistant chat/stream/confirm endpoints (links the AI architecture doc). |
| Video sessions | [areas/video-sessions.md](areas/video-sessions.md) | User + admin (agent) Jitsi session lifecycle, audit logging, roles. |
| Fraud detection | [areas/fraud.md](areas/fraud.md) | Live scoring (rules + kNN anomaly), held-transfer store, post-commit flagging, offline Kaggle benchmark. |
| RAG knowledge base | [areas/rag-knowledge.md](areas/rag-knowledge.md) | Policy-doc ingestion, chunking, embedding, pgvector retrieval. |
| Support MCP server | [areas/mcp-support.md](areas/mcp-support.md) | Read-only MCP server for internal support/ops staff; 10 customer-scoped tools. |
| Data layer | [areas/data-layer.md](areas/data-layer.md) | App repository seam (mongo/postgres), AI Postgres (pgvector), vector repositories, guard test. |
| Cross-cutting | [areas/cross-cutting.md](areas/cross-cutting.md) | Middleware (auth, cookies, roles, error-handler) and utils/DTOs. |

## Fraud (`server/src/fraud/`)

### Live path

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `fraud/types.ts` | util | Shared types: `FRAUD_FEATURE_DIM` (29), `FraudLabel`, `RawTransaction`, `Scaler`, `FraudVectorRecord`, `KnnNeighbor`, `FraudKnnScore`. |
| `fraud/service.ts` | service | `scoreTransfer` (rules + anomaly, reads app repos); `recordTransferRiskFlag` (best-effort post-commit flag to AI Postgres); `listFraudFlags` (analyst/MCP read). |
| `fraud/risk.ts` | util | `computeRisk` — pure, deterministic rules engine; six weighted rules + kNN anomaly contribution → 0..1 score + level + reasons. |
| `fraud/anomaly.ts` | util | `knnAnomalyScore` — unsupervised kNN anomaly score on user history (no labels, no embeddings). Used by `service.ts`. |
| `fraud/holds.ts` | service | `shouldHold`, `createHold`, `confirmHold`, `cancelHold`, `listHeldTransfers` — `held_transfers` lifecycle in the AI Postgres (self-managed table). |
| `fraud/repository.ts` | repository | pgvector-backed `fraud_transactions` table in AI Postgres; `insertMany`, `knnSearch`, `countLabeled`. Used by offline benchmark only. |

### Offline benchmark (not in the request path)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `fraud/csv.ts` | util | `parseCreditCardCsv` — parses Kaggle Credit Card Fraud CSV into `RawTransaction[]`. |
| `fraud/scaler.ts` | util | `fitScaler` / `transform` / `assertScalerDim` — standard scaler; also used by `anomaly.ts` in the live path. |
| `fraud/knn.ts` | util | `scoreByKnn` — pgvector kNN fraud probability (production serving path for labeled Kaggle data). |
| `fraud/knnEval.ts` | util | `knnFraudProbInMemory` — brute-force in-memory kNN for offline evaluation (no DB required). |
| `fraud/logreg.ts` | util | `trainLogReg` / `predictProba` — pure-TS logistic regression with balanced class weights. |
| `fraud/metrics.ts` | util | `confusionAtThreshold`, `prAuc`, `bestF1Threshold` — precision-recall metrics for imbalanced classification. |

## RAG knowledge base (`server/src/ai/rag/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `ai/rag/retriever.ts` | service | `retrievePolicyDocs` (env-gated) + `searchKnowledge` (injected core) — embed query and cosine-search the knowledge base. |
| `ai/rag/embeddings.ts` | util | `getEmbeddings` / `embedQuery` / `embedDocuments` — process-singleton `OpenAIEmbeddings` wrapper. |
| `ai/rag/ingest.ts` | service | `syncKnowledgeBase` — pulls from a source, chunks + embeds changed files, upserts into the vector store; detects and removes vanished docs. |
| `ai/rag/chunk.ts` | util | `chunkDocument` — heading-aware, overlapping splitter; `approxTokens` helper. |
| `ai/rag/pdf.ts` | util | `extractPdfText` — wraps `pdf-parse`, strips page-separator lines. |
| `ai/rag/sources/types.ts` | util | `KnowledgeSource` interface and `SourceFile` type. |
| `ai/rag/sources/local.ts` | util | `createLocalSource` — walks a local directory for .md/.txt/.markdown/.pdf files; revision = SHA-256 of bytes. |
| `ai/rag/sources/drive.ts` | util | `createDriveSource` — walks a Google Drive folder recursively via the `DriveClient` abstraction. |
| `ai/rag/sources/driveClient.ts` | util | `createGoogleDriveClient` — the only googleapis import; service-account auth; `DriveClient` implementation. |

## MCP (`server/src/mcp/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `mcp/support.ts` | service | `createSupportTools` (injectable, testable) + `buildSupportMcpServer` — read-only support MCP server with 10 customer-scoped tools. |

## Vector repositories (`server/src/repositories/vector/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `repositories/vector/types.ts` | repository-seam | `KnowledgeRepository` interface plus `KnowledgeDocumentSource`, `KnowledgeDocumentRecord`, `KnowledgeChunkInput`, `KnowledgeSearchHit`, `KnowledgeSearchCriteria`, `KnowledgeDocumentUpsert`. |
| `repositories/vector/schema.ts` | repository | Drizzle schema for `knowledge_documents` and `knowledge_chunks` (`vector(1536)` column, HNSW cosine index). |
| `repositories/vector/knowledge.repository.ts` | repository | `knowledgeRepository` singleton — upsert, replaceChunks, cosine search (`<=>`), listDocumentRefs, deleteBySourceRef. |

## AI Postgres connection (`server/src/db/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `db/vector.ts` | boot | `getAiDb` / `runAiMigrations` / `closeAiPool` — dedicated pgvector Postgres connection, independent of the app DB driver. |

## Routes (`server/src/routes/`)

| Path | Layer | Mounted at | Role (one line) |
|------|-------|-----------|-----------------|
| `routes/auth.routes.ts` | route | `/api/auth` | Register, verify email, resend, login, `me`, logout; sets/clears auth + CSRF cookies. |
| `routes/user.routes.ts` | route | `/api/accounts` | Own account summary, personal-details read/update/skip (mounted as **accounts**). |
| `routes/userProfile.routes.ts` | route | `/api/users` | Public profile + relationship stats and the viewer's ledger with a counterparty. |
| `routes/transaction.routes.ts` | route | `/api/transactions` | List own transactions, FX quote, execute manual transfer (money movement). |
| `routes/exchangeRate.routes.ts` | route | `/api/exchange-rates` | Current supported-currency rate snapshot for the client. |
| `routes/ai.routes.ts` | route | `/api/ai` | Assistant chat, SSE stream, and pending-transfer confirmation endpoints. |
| `routes/videoSession.routes.ts` | route | `/api/video-sessions` + `/api/admin/video-sessions` | User + admin (agent) video-session lifecycle; exports `default` and `adminVideoSessionRoutes`. |

## Services (`server/src/services/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `services/account.service.ts` | service | `accountService` — user lookup by id / id-or-email, balance, account reads. |
| `services/auth.service.ts` | service | `authService` — register, verify, login, resend; password hashing + verification tokens. |
| `services/personalDetails.service.ts` | service | `personalDetailsService` — ensure/read/update/skip a user's KYC personal details. |
| `services/transactionQuery.service.ts` | service | `transactionQueryService` — paginated history, counterparty filter, relationship stats. |
| `services/transfer.service.ts` | service | `executeTransfer` / `executeTransferWithSession` — atomic debit/credit, AI limit checks. |
| `services/fx.service.ts` | service | Supported currencies, provider rate fetch + cache, `buildTransferQuote`, `getCurrentRates`. |
| `services/email.service.ts` | service | Sends verification emails via the configured sender. |
| `services/videoSession.service.ts` | service | Create/get/assign/join/end video sessions; role-scoped agent operations. |
| `services/jitsiProvider.service.ts` | service | Builds Jitsi room + JWT join config for a video session. |
| `services/videoAuditLog.service.ts` | service | `writeVideoAuditLog` — append-only video-session audit events. |
| `services/aiConversation.service.ts` | service | `mongoConversationStore` — assistant conversation persistence (`ConversationStore`). |
| `services/aiPendingTransfer.service.ts` | service | Prepare/modify/resume/respond to AI pending-transfer cards (HITL confirm/deny). |
| `services/aiAuditLog.service.ts` | service | `writeAiAuditLog` — append-only assistant audit events. |

## Repositories (`server/src/repositories/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `repositories/types.ts` | repository-seam | Repository interfaces + the `Repositories` registry contract (driver-agnostic). |
| `repositories/registry.ts` | repository-seam | `createRepositories(driver)` — selects mongo or postgres implementation. |
| `repositories/index.ts` | repository-seam | `set/get/clearRepositories` singleton accessor; re-exports `types`. |
| `repositories/no-direct-model-imports.test.ts` | repository-seam (guard) | Build guard: only `repositories/mongo` + `ai/evals` may import `../models/*`. |
| `repositories/mongo/index.ts` | repository | `createMongoRepositories()` — wires all Mongo repositories. |
| `repositories/mongo/user.repository.ts` | repository | Mongo `UserRepository` implementation. |
| `repositories/mongo/transaction.repository.ts` | repository | Mongo `TransactionRepository` implementation. |
| `repositories/mongo/transaction.ts` | repository | Mongo transaction-document mapping helpers. |
| `repositories/mongo/personalDetails.repository.ts` | repository | Mongo `PersonalDetailsRepository` implementation. |
| `repositories/mongo/exchangeRate.repository.ts` | repository | Mongo `ExchangeRateRepository` implementation. |
| `repositories/mongo/aiConversation.repository.ts` | repository | Mongo `AiConversationRepository` implementation. |
| `repositories/mongo/aiPendingTransfer.repository.ts` | repository | Mongo `AiPendingTransferRepository` implementation. |
| `repositories/mongo/aiAuditLog.repository.ts` | repository | Mongo `AiAuditLogRepository` implementation. |
| `repositories/mongo/videoSession.repository.ts` | repository | Mongo `VideoSessionRepository` implementation. |
| `repositories/mongo/videoAuditLog.repository.ts` | repository | Mongo `VideoAuditLogRepository` implementation. |
| `repositories/mongo/stub.ts` | repository | Shared mongo test/stub helpers. |
| `repositories/postgres/index.ts` | repository | `createPostgresRepositories()` — wires all Postgres repositories. |
| `repositories/postgres/user.repository.ts` | repository | Postgres `UserRepository` implementation. |
| `repositories/postgres/transaction.repository.ts` | repository | Postgres `TransactionRepository` implementation. |
| `repositories/postgres/transaction.ts` | repository | Postgres transaction-row mapping helpers. |
| `repositories/postgres/personalDetails.repository.ts` | repository | Postgres `PersonalDetailsRepository` implementation. |
| `repositories/postgres/exchangeRate.repository.ts` | repository | Postgres `ExchangeRateRepository` implementation. |
| `repositories/postgres/aiConversation.repository.ts` | repository | Postgres `AiConversationRepository` implementation. |
| `repositories/postgres/aiPendingTransfer.repository.ts` | repository | Postgres `AiPendingTransferRepository` implementation. |
| `repositories/postgres/aiAuditLog.repository.ts` | repository | Postgres `AiAuditLogRepository` implementation. |
| `repositories/postgres/videoSession.repository.ts` | repository | Postgres `VideoSessionRepository` implementation. |
| `repositories/postgres/videoAuditLog.repository.ts` | repository | Postgres `VideoAuditLogRepository` implementation. |
| `repositories/postgres/schema.ts` | repository | Postgres table/column schema definitions. |
| `repositories/postgres/id.ts` | repository | Id encoding between Postgres rows and the app's string ids. |
| `repositories/postgres/errors.ts` | repository | Postgres error translation to app errors. |

## Models (`server/src/models/`)

Mongoose schemas — the Mongo-driver backing store. Only `repositories/mongo`
(and `ai/evals`) may import these directly; everything else goes through the
repository seam.

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `models/User.ts` | model | User account: credentials, balance, `isVerified`, role (`userRoleValues`). |
| `models/PersonalDetails.ts` | model | KYC personal details (name, DOB, address) and provided/skipped status. |
| `models/Transaction.ts` | model | Ledger entry: amount, parties, reason, FX metadata, timestamps. |
| `models/ExchangeRate.ts` | model | Cached FX rate snapshot (provider payload, validity window). |
| `models/AiConversation.ts` | model | Persisted assistant conversation turns. |
| `models/AiPendingTransfer.ts` | model | AI-prepared transfer awaiting user confirm/deny (HITL gate). |
| `models/AiAuditLog.ts` | model | Append-only assistant audit events. |
| `models/VideoSession.ts` | model | Video session: type/status/source enums, parties, lifecycle timestamps. |
| `models/VideoAuditLog.ts` | model | Append-only video-session audit events (`videoAuditEventValues`). |

## Middleware (`server/src/middleware/`)

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `middleware/auth.ts` | middleware | `requireAuth` — verifies the JWT session cookie, sets `req.userId` / `req.csrfToken`. |
| `middleware/cookies.ts` | middleware | `parseCookies` — parses the request cookie header into `req.cookies`. |
| `middleware/roles.ts` | middleware | `requireAnyVideoAgentRole` + role helpers gating admin video-session routes. |
| `middleware/error-handler.ts` | middleware | `errorHandler` — maps `AppError`/`ZodError`/unknown errors to the JSON error envelope. |

## Utils / DTOs (`server/src/utils/`)

Documented in the Cross-cutting area; listed here for inventory completeness.

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `utils/app-error.ts` | util | `AppError` class — HTTP status + optional machine-readable `code`. |
| `utils/auth.ts` | util | Cookie names and token lifetimes (`virly_auth`, `virly_csrf`, 7d/30d). |
| `utils/session.ts` | util | `setAuthCookies`/`clearAuthCookies`, CSRF token create/hash. |
| `utils/token.ts` | util | Verification-token hashing and expiry. |
| `utils/otp.ts` | util | `randomStartingBalance` and related random helpers. |
| `utils/pagination.ts` | util | `parsePagination` / `getPaginationMeta` (page/limit). |
| `utils/personal-details.ts` | util | `toAuthUserDto` / `toPersonalDetailsDto` mappers. |
| `utils/transaction-dto.ts` | util | `toTransactionDto` — ledger entry → API DTO. |
| `utils/user-profile-dto.ts` | util | Public-profile + relationship DTO mappers and `relationshipStatus` resolver. |
| `utils/env.ts` | util | Typed env readers (`getStringEnv`, `getIntEnv`, `getBooleanEnv`, …). |

## Boot (`server/src/`)

Not part of the five mandated directories; listed for orientation.

| Path | Layer | Role (one line) |
|------|-------|-----------------|
| `app.ts` | boot | Builds the Express app, security middleware, rate limiters, and the 8 route mounts. |
| `index.ts` | boot | Process entry: connects the DB and starts the HTTP server. |
| `db.ts` | boot | Driver selection + connection; calls `setRepositories` at boot. |
| `config.ts` | boot | Typed runtime config (`config`, `isProduction`) from env. |

## Test files (noted, not part of the area docs)

The brief scopes the inventory to non-test source. These co-located test files
exist under the five directories and are intentionally **not** documented in the
area files (they are covered by [`../testing.md`](../testing.md)):

- `repositories/registry.test.ts`, `repositories/types.test.ts`,
  `repositories/no-direct-model-imports.test.ts` (the guard — described in
  `index.md`).
- `repositories/mongo/*.repository.test.ts` (9 files: aiAuditLog, aiConversation,
  aiPendingTransfer, exchangeRate, personalDetails, transaction, user,
  videoAuditLog, videoSession).
- `repositories/postgres/{errors,id,schema}.test.ts` (3 files).

`routes/`, `services/`, `models/`, and `middleware/` contain **no** co-located
`*.test.ts` files; every non-test file in those four directories appears above.
