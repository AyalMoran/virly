# Configuration Reference

> **Audience:** Anyone running, deploying, or onboarding to the app.
> This is the single authoritative reference for every environment variable the server reads.
> For deployment procedures see [`operations.md`](operations.md) (forward link — doc written later).
> For secret-rotation and threat model detail see [`security.md`](security.md) (forward link — doc written later).
> For a quick-start overview see [`../README.md`](../README.md).

---

## How configuration is loaded

`server/src/config.ts` calls `dotenv.config()` at import time, which reads `server/.env`.
All variables are then read through helpers in `server/src/utils/env.ts`:

| Helper | Behaviour |
|---|---|
| `getStringEnv(name, default)` | Returns `default` when unset; **throws** if set to an empty string |
| `getOptionalStringEnv(name)` | Returns `undefined` when unset or blank |
| `getBooleanEnv(name, {defaultValue})` | Accepts `1/true/yes/on` or `0/false/no/off`; returns `defaultValue` when unset; **throws** on any other value |
| `getIntEnv(name, {defaultValue, min?, max?})` | Returns `defaultValue` when unset; **throws** if not a valid integer or outside `[min, max]` |

All helpers support an **`aliases`** list: the first matching name in `[name, ...aliases]` wins.

---

## Fail-fast boot contract

`config.ts` validates several variables at module-load time and calls `throw new Error(...)` before the Express server binds if they fail. The exact conditions:

| Variable | Throws when |
|---|---|
| `VIRLY_JWT_SECRET` | In production (`NODE_ENV=production`) and the value equals `"change-me-in-production"` OR is shorter than 32 characters |
| `VIRLY_VIDEO_PROVIDER` | Set to a value other than `jitsi-jaas`, `jitsi-self-hosted`, `jitsi-public-demo`, or `mock` |
| `VIRLY_JITSI_PRIVATE_KEY` | `VIRLY_VIDEO_PROVIDER` is `jitsi-jaas` or `jitsi-self-hosted` AND the key is absent |
| `VIRLY_JITSI_APP_ID` / `VIRLY_JITSI_KID` | `VIRLY_VIDEO_PROVIDER` is `jitsi-jaas` AND either is absent |
| `VIRLY_POSTGRES_URL` | `VIRLY_DB_DRIVER=postgres` AND the URL is absent |
| `VIRLY_COOKIE_SAME_SITE` | Set to a value other than `lax`, `strict`, or `none` |
| `VIRLY_DB_DRIVER` | Set to a value other than `mongo` or `postgres` |
| `VIRLY_AI_MEMORY_BACKEND` | Set to a value other than `mongo` or `postgres`; **or** set to `postgres` while no AI Postgres URL resolves (`VIRLY_AI_PG_URL` / `VIRLY_VECTOR_DB_URL` / `VIRLY_POSTGRES_URL` all absent) |
| `VIRLY_RAG_ENABLED` | Truthy AND no AI Postgres URL resolves (same three-name fallback) |
| `VIRLY_RAG_MIN_SCORE` | Set to a value that is not a number in `[0, 1]` |
| `VIRLY_FRAUD_HOLD_LEVEL` | Set to a value other than `off`, `medium`, or `high`; **or** set to `medium`/`high` while no AI Postgres URL resolves (same three-name fallback) |

---

## Reference table

Variables are grouped by concern. **Required?** reflects whether a missing value causes a boot failure or runtime error; see the "Fails how if missing" column for the exact behaviour. Legacy aliases are listed in the Variable column in parentheses.

### Database

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_DB_DRIVER` | No | `mongo` | `config.ts:102`, `db.ts`, `index.ts` | Defaults to `mongo`; throws at boot if set to an invalid value |
| `VIRLY_MONGODB_URI` (`MONGODB_URI`) | No default-wise, but a reachable Mongo is required in **every** mode | `mongodb://127.0.0.1:27017/virly` | `config.ts:209`, `db.ts:8` | `db.ts` calls `mongoose.connect` unconditionally in `connectDb()`, so a reachable MongoDB is required even when `VIRLY_DB_DRIVER=postgres` (the Phase-1 hybrid — see [operations](operations.md) and [Postgres Phase 2 spec](planning/specs/2026-06-25-postgres-migration-phase2-design.md)). Setting `VIRLY_AI_MEMORY_BACKEND=postgres` moves only the AI checkpointer/store off Mongo; the boot-time Mongo connection still happens. Connection failure aborts/blocks at runtime |
| `VIRLY_POSTGRES_URL` (`POSTGRES_URL`, `DATABASE_URL`) | **Yes — when `VIRLY_DB_DRIVER=postgres`** | — | `config.ts:114`, `db/postgres.ts` | `Error: VIRLY_POSTGRES_URL is required when VIRLY_DB_DRIVER=postgres.` thrown at boot |
| `VIRLY_AI_MEMORY_BACKEND` | No | `mongo` | `config.ts:162`, `ai/v2/memory/setup.ts`, `index.ts` | Selects where the LangGraph checkpointer + long-term store live (`mongo` keeps them on Mongo; `postgres` consolidates them onto the AI Postgres). Reversible by env flip. Throws at boot on an invalid value, or on `postgres` with no AI Postgres URL. See [AI architecture](ai/architecture.md) and the [Postgres Phase 2 spec](planning/specs/2026-06-25-postgres-migration-phase2-design.md) |

### Auth / JWT

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_JWT_SECRET` (`JWT_SECRET`) | **Yes — in production** | `change-me-in-production` | `config.ts:81`, `utils/token.ts`, `middleware/auth.ts` | In production: throws `VIRLY_JWT_SECRET must be set to a strong secret (>= 32 characters) in production.` at boot. Outside production: server starts with the weak default — auth tokens are signed with a known placeholder, creating a full auth bypass |

### Email

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `RESEND_API_KEY` | No | — (optional) | `config.ts:214`, `services/email.service.ts` | Emails are not delivered; verification links and held-transfer confirmation links are printed to the console log instead (graceful fallback) |
| `VIRLY_EMAIL_FROM` (`EMAIL_FROM`) | No | `Virly <verify@virly.ayal.online>` | `config.ts:215`, `services/email.service.ts` | Uses built-in default sender address |

### AI / OpenAI

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `OPENAI_API_KEY` (`OPENAI_API_KEY`) | No | `""` (empty string) | `config.ts:231`, `ai/llm.ts`, `ai/v2/model.ts` | `config.ai.openAIApiKey` is empty; `createConfiguredAssistantLlmProvider()` returns `undefined`; the AI assistant falls back to deterministic mode with no LLM calls. Also used by the RAG embeddings client (`ai/rag/embeddings.ts`) — without it, ingestion/retrieval cannot embed |
| `VIRLY_AI_MODEL` (`AI_MODEL`) | No | `gpt-4o-mini` | `config.ts:228`, `ai/llm.ts`, `ai/v2/model.ts` | If unset, defaults to `gpt-4o-mini`. If explicitly set to a blank/whitespace string, **throws at boot** via `getStringEnv` (`utils/env.ts`). The LLM provider is disabled only when `OPENAI_API_KEY` is empty (`ai/llm.ts`), never via this var. |
| `VIRLY_AI_GRAPH_VERSION` | No | `v2` | `config.ts:242` | Defaults to `v2` (LLM-first agent loop); set to `v1` to use the legacy deterministic graph |
| `VIRLY_AI_DEBUG_TRACE` | No | `false` | `config.ts:234` | Debug tracing disabled |
| `VIRLY_AI_MOCK_PER_TRANSFER_LIMIT` | No | `500` | `config.ts:220` | Uses 500 ILS per-transfer limit in dev/mock mode; also the per-transfer reference the fraud risk model scores against (`fraud/service.ts`) |
| `VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT` | No | `1000` | `config.ts:224` | Uses 1000 ILS daily limit in dev/mock mode; also the daily reference the fraud risk model scores against (`fraud/service.ts`) |

#### AI eval variables (offline eval tooling only — not used by the running server)

| Variable | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_AI_EVAL_ENABLE_LLM_DEV` | No | `false` | `ai/evals/runner.ts:45` | LLM-dev eval mode disabled; throws if mode is `llm-dev` and this is not `true` |
| `VIRLY_AI_EVAL_ENABLE_MONGO` | No | `false` | `ai/evals/seededMongo.ts:68` | Seeded-Mongo eval mode disabled; throws if mode is `seeded-mongo` and this is not `true` |
| `VIRLY_AI_EVAL_MONGO_URI` | No | — | `ai/evals/seededMongo.ts:64` | Throws `Seeded Mongo eval mode requires VIRLY_AI_EVAL_MONGO_URI.` when seeded-Mongo mode is enabled |
| `VIRLY_AI_EVAL_KEEP_MONGO` | No | `false` | `ai/evals/seededMongo.ts:72` | After a seeded-Mongo eval run, the database is dropped (default cleanup behaviour) |
| `LANGSMITH_API_KEY` | No | — | `ai/evals/langsmith/run-experiment.ts:277`, `ai/evals/langsmith/sync-dataset.ts:39` | Throws when running LangSmith experiment or dataset-sync scripts; not used by the server at runtime |

### RAG knowledge base (pgvector)

Added in the RAG / fraud / MCP work (PR #6). The knowledge base lives in a **dedicated AI Postgres** (pgvector), independent of `VIRLY_DB_DRIVER`, so it works even in mongo mode. See [AI architecture](ai/architecture.md) and `RAG_PLAN.md`.

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_AI_PG_URL` (`VIRLY_VECTOR_DB_URL`) | **Yes — when RAG, fraud holds, or `VIRLY_AI_MEMORY_BACKEND=postgres` is enabled** | falls back to `VIRLY_POSTGRES_URL` | `config.ts:132`, `db/vector.ts` | Dedicated pgvector Postgres for AI/ML data. When none of the three names resolves and a feature needs it, the relevant boot check throws |
| `VIRLY_RAG_ENABLED` | No | `false` | `config.ts:141`, `ai/v2/tools/policyDocs.ts`, `ai/rag/retriever.ts` | RAG off: the `searchPolicyDocs` tool stays inert (returns a graceful "unavailable" message). Throws at boot if turned on with no AI Postgres URL |
| `VIRLY_RAG_EMBEDDING_MODEL` | No | `text-embedding-3-small` | `config.ts:293`, `ai/rag/embeddings.ts` | Uses the default OpenAI embedding model (1536 dims — fixed to match the `vector(1536)` column) |
| `VIRLY_RAG_TOP_K` | No | `5` (1–50) | `config.ts:296`, `ai/rag/retriever.ts` | Returns up to 5 chunks per query; throws if outside `[1, 50]` |
| `VIRLY_RAG_MIN_SCORE` | No | `0` | `config.ts:149`, `ai/rag/retriever.ts` | Keeps all retrieved chunks (no cosine-similarity floor); throws if not a number in `[0, 1]` |
| `VIRLY_RAG_LOCAL_DIR` | No | — (optional) | `config.ts:300`, `ai/rag/sources/local.ts` | Local-folder ingestion source disabled (used by `npm run rag:sync`, not at runtime) |
| `VIRLY_RAG_DRIVE_FOLDER_ID` | No | — (optional) | `config.ts:303`, `ai/rag/sources/drive.ts` | Google Drive ingestion source disabled (sync-time only) |
| `VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON` | No | — (optional) | `config.ts:305`, `ai/rag/sources/driveClient.ts` | Service-account key as raw JSON; one of this or the file path is required for Drive sync |
| `VIRLY_GOOGLE_APPLICATION_CREDENTIALS` (`GOOGLE_APPLICATION_CREDENTIALS`) | No | — (optional) | `config.ts:307`, `ai/rag/sources/driveClient.ts` | Path to the service-account key file (alternative to the inline JSON above) |

### Fraud (hold-until-email-confirmation)

Added in PR #6 (RAG_PLAN.md M4). Risk scoring is always on (best-effort, post-commit flags); these vars control the optional *hold* gate. The hold store lives in the AI Postgres. See [transfers domain](domain/transfers.md) and [security](security.md).

| Variable | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_FRAUD_HOLD_LEVEL` | No | `off` | `config.ts:182`, `routes/transaction.routes.ts`, `fraud/holds.ts` | `off` = flag only (no hold). `high`/`medium` = hold transfers at that risk level and above for email confirmation. Throws at boot on an invalid value, or when enabled with no AI Postgres URL |
| `VIRLY_FRAUD_HOLD_EXPIRY_HOURS` | No | `24` (1–168) | `config.ts:316`, `fraud/holds.ts` | A held transfer's email-confirmation link stays valid for 24h; throws if outside `[1, 168]` |

### FX / Exchange rates

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_FX_PROVIDER` (`FX_PROVIDER`) | No | `exchangerate-api` | `config.ts:248`, `services/fx.service.ts` | Falls back to built-in provider name |
| `VIRLY_FX_API_KEY` (`EXCHANGE_RATE_API_KEY`, `FX_API_KEY`) | No | — (optional) | `config.ts:251`, `services/fx.service.ts` | FX API calls will fail or use a fallback if the provider requires a key |
| `VIRLY_FX_BASE_URL` (`FX_BASE_URL`) | No | — (optional) | `config.ts:254`, `services/fx.service.ts` | Provider SDK uses its default base URL |
| `VIRLY_FX_CACHE_TTL_HOURS` | No | `48` | `config.ts:257`, `services/fx.service.ts` | Rates cached for 48 hours |

### Video / Jitsi

| Variable | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `VIRLY_VIDEO_PROVIDER` | No | `jitsi-public-demo` | `config.ts:50`, `services/jitsiProvider.service.ts` | Defaults to public Jitsi demo; throws at boot on invalid value |
| `VIRLY_JITSI_DOMAIN` | No | `meet.jit.si` | `config.ts:266`, `services/jitsiProvider.service.ts` | Uses public Jitsi domain |
| `VIRLY_JITSI_APP_ID` | **Yes — when `VIRLY_VIDEO_PROVIDER=jitsi-jaas`** | — | `config.ts:59`, `services/jitsiProvider.service.ts` | Throws at boot: `VIRLY_JITSI_APP_ID and VIRLY_JITSI_KID are required when VIRLY_VIDEO_PROVIDER is jitsi-jaas.` |
| `VIRLY_JITSI_KID` | **Yes — when `VIRLY_VIDEO_PROVIDER=jitsi-jaas`** | — | `config.ts:60`, `services/jitsiProvider.service.ts` | Throws at boot (same message as `VIRLY_JITSI_APP_ID` above) |
| `VIRLY_JITSI_PRIVATE_KEY` | **Yes — when provider is `jitsi-jaas` or `jitsi-self-hosted`** | — | `config.ts:58`, `services/jitsiProvider.service.ts` | Throws at boot: `VIRLY_JITSI_PRIVATE_KEY is required when VIRLY_VIDEO_PROVIDER is jitsi-jaas or jitsi-self-hosted.` |
| `VIRLY_JITSI_AUDIENCE` | No | `jitsi` | `config.ts:268`, `services/jitsiProvider.service.ts` | Uses `jitsi` as JWT audience claim |
| `VIRLY_JITSI_ISSUER` | No | — (optional) | `config.ts:269`, `services/jitsiProvider.service.ts` | Derived from provider/appId at runtime if absent |
| `VIRLY_JITSI_SUBJECT` | No | — (optional) | `config.ts:270`, `services/jitsiProvider.service.ts` | Derived from provider/domain at runtime if absent |
| `VIRLY_JITSI_TOKEN_TTL_SECONDS` | No | `900` (15 min) | `config.ts:273`, `services/jitsiProvider.service.ts` | JWT tokens valid for 15 minutes |

### Server / Runtime

| Variable (aliases) | Required? | Default | Used by | Fails how if missing |
|---|---|---|---|---|
| `NODE_ENV` | No | (unset) | `config.ts:11` | Treated as non-production; JWT secret strength check is skipped; cookie `SameSite` defaults to `lax` |
| `VIRLY_PORT` (`PORT`) | No | `3000` | `config.ts:198`, `index.ts` | Listens on port 3000 |
| `VIRLY_SERVER_URL` (`SERVER_URL`) | No | `http://localhost:3000` | `config.ts:206` | Used to construct verification email links and held-transfer confirmation links (`routes/transaction.routes.ts`) |
| `VIRLY_CLIENT_URL` (`CLIENT_URL`) | No | `http://localhost:5173` | `config.ts:38`, `app.ts` | CORS origin; multiple comma-separated URLs are accepted |
| `VIRLY_COOKIE_SAME_SITE` (`COOKIE_SAME_SITE`) | No | `none` in production, `lax` otherwise | `config.ts:23` | Uses the derived default; throws at boot if set to an invalid value |
| `VIRLY_THROTTLE_MS` | No | — (off) | `app.ts:71` | Read directly from `process.env` (not via `config.ts`). When set to a positive integer, a dev middleware delays **every** response by that many ms — handy for previewing the client boot/loading splash against a slow API. Off unless present |
| `VIRLY_MCP_OPERATOR` | No | falls back to `USER`, then `"unknown"` | `mcp/support.ts:280` | Read directly from `process.env` (not via `config.ts`). Labels each entry in the Support MCP server's stderr audit log so customer-data reads are attributable to an operator. Only relevant when running `npm run mcp:support` |

---

## Configuration profiles

### Local development (MongoDB, default)

> **Which `.env.example`?** `server/.env.example` is the comprehensive onboarding
> template — it lists every runtime variable and is the file `README.md` copies
> and `docker-compose.yml` consumes (via `env_file: ./server/.env`). The repo-root
> `.env.example` is only a minimal pointer stub. Use `server/.env.example`.

No required variables for local Mongo mode. Copy `server/.env.example` to `server/.env` (matching `README.md`) and set a JWT secret:

```dotenv
VIRLY_JWT_SECRET=any-32-char-string-is-fine-locally
# VIRLY_DB_DRIVER defaults to mongo
# VIRLY_MONGODB_URI defaults to mongodb://127.0.0.1:27017/virly
```

`RESEND_API_KEY` is optional — email verification links are printed to stdout when it is absent.
`OPENAI_API_KEY` is optional — the AI assistant runs in deterministic mode without it.

### PostgreSQL mode

```dotenv
VIRLY_DB_DRIVER=postgres
VIRLY_POSTGRES_URL=postgresql://user:pass@host:5432/virly
```

`VIRLY_POSTGRES_URL` is **required** and the server throws at boot if absent when this driver is selected. See the Postgres migration spec at `docs/planning/specs/2026-06-22-postgres-migration-design.md` §10 for schema and migration details.

### RAG / fraud-hold mode

Both subsystems need the dedicated AI Postgres (pgvector). They are off by default; enable them per environment:

```dotenv
# Point at a pgvector-capable Postgres (the compose `postgres` service already is one).
VIRLY_AI_PG_URL=postgres://virly:virly@localhost:5432/virly
# Turn on policy/loan retrieval (the searchPolicyDocs tool):
VIRLY_RAG_ENABLED=true
# Hold high-risk transfers until the sender confirms by email:
VIRLY_FRAUD_HOLD_LEVEL=high
```

Ingest the knowledge base once before retrieval works: `npm run rag:migrate` then `npm run rag:sync` (see [operations](operations.md)). Risk scoring and best-effort flags run even with `VIRLY_FRAUD_HOLD_LEVEL=off`.

### Docker Compose (`docker-compose.yml`)

The compose file reads `./server/.env` via `env_file` and additionally sets these four on the `app` service:

```yaml
NODE_ENV: development
VIRLY_PORT: ${VIRLY_PORT:-3000}
VIRLY_MONGODB_URI: ${VIRLY_MONGODB_URI:-mongodb://mongo:27017/virly?replicaSet=rs0}
VIRLY_AI_PG_URL: ${VIRLY_AI_PG_URL:-postgres://virly:virly@postgres:5432/virly}
```

The `VIRLY_MONGODB_URI` override points at the compose-internal `mongo` service; `VIRLY_AI_PG_URL` points at the compose-internal `postgres` service. Compose now runs a dedicated **`postgres`** service on the `pgvector/pgvector:pg16` image (the RAG knowledge base needs the `vector` extension), and `app` waits on it via a healthcheck. Everything else comes from `server/.env`.

### Test profile (`docker-compose.test.yml`)

The test compose file starts infrastructure services only — no application container, no env-file injection. It exposes:

- **Postgres** (`pgvector/pgvector:pg16` — a superset of `postgres:16`, so the knowledge-base contract test can `CREATE EXTENSION vector`): `POSTGRES_DB=virly`, `POSTGRES_USER=virly`, `POSTGRES_PASSWORD=virly`, mapped to host port `5433`
- **MongoDB** (`mongo:7`): replica-set mode, mapped to host port `27018`

Test suites set their own env vars programmatically (e.g. `VIRLY_DB_DRIVER=postgres`, `VIRLY_POSTGRES_URL=postgresql://virly:virly@localhost:5433/virly`). No application-level env file is read by the test compose file itself.

### JaaS (Jitsi-as-a-Service) mode

```dotenv
VIRLY_VIDEO_PROVIDER=jitsi-jaas
VIRLY_JITSI_APP_ID=your-jaas-app-id
VIRLY_JITSI_KID=your-key-id          # becomes <appId>/<kid> automatically
VIRLY_JITSI_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...
```

All three are required; the server throws at boot if any are absent when `VIRLY_VIDEO_PROVIDER=jitsi-jaas`.

### Self-hosted Jitsi mode

```dotenv
VIRLY_VIDEO_PROVIDER=jitsi-self-hosted
VIRLY_JITSI_DOMAIN=jitsi.example.com
VIRLY_JITSI_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...
```

`VIRLY_JITSI_PRIVATE_KEY` is required; `VIRLY_JITSI_APP_ID` and `VIRLY_JITSI_KID` are optional.

---

## Cross-check: `.env.example` vs code

The repo has **two** example files, with different roles:

| File | Role | Required vars present? |
|---|---|---|
| `server/.env.example` (57 lines) | The operative onboarding template. Copied to `server/.env` by `README.md`; read by `docker-compose.yml` (`env_file: ./server/.env`). Lists nearly every runtime variable, including the RAG (`VIRLY_AI_PG_URL`, `VIRLY_RAG_*`, `VIRLY_GOOGLE_*`), AI-memory (`VIRLY_AI_MEMORY_BACKEND`), and fraud-hold (`VIRLY_FRAUD_HOLD_*`) blocks added in PR #6. | Yes — contains `VIRLY_JWT_SECRET` and `VIRLY_POSTGRES_URL`, the only unconditionally required vars. |
| `.env.example` (repo root, 1-line stub) | A pointer comment (`docker-compose.yml reads application settings from server/.env`). Not read by `docker-compose` and not the file `README.md` copies. | N/A — lists no variables by design; defers entirely to `server/.env.example`. |

The required-variable acceptance criterion is satisfied by `server/.env.example`, which carries both required vars (`VIRLY_JWT_SECRET`, `VIRLY_POSTGRES_URL`).

Optional variables omitted from `server/.env.example` (acceptable — all have safe defaults): `VIRLY_AI_GRAPH_VERSION`, `VIRLY_AI_DEBUG_TRACE`, `VIRLY_FX_PROVIDER`, `VIRLY_FX_API_KEY`, `VIRLY_FX_BASE_URL`, `VIRLY_FX_CACHE_TTL_HOURS`, `VIRLY_THROTTLE_MS` (dev-only latency simulator), and `VIRLY_MCP_OPERATOR` (Support MCP audit-log label). No variable present in either example file is unread by `server/src` runtime code.

> Note: eval-only variables (`VIRLY_AI_EVAL_*`, `LANGSMITH_API_KEY`) are intentionally excluded from both example files because they are not part of the running server; they belong in CI or developer-local override files.
