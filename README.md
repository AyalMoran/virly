# Virly

**A full-stack banking MVP with an AI assistant that can actually move your money.**

Virly is a React + Express monorepo that looks and behaves like a modern fintech app — complete with a LangGraph-powered AI agent, FX-aware transfers, Jitsi video sessions, and a human-in-the-loop confirmation flow before any transfer executes.

---

## Features

### Banking Core
- User registration with email, password, and phone
- Email verification via [Resend](https://resend.com) (falls back to console log for local dev)
- Secure login — HttpOnly JWT cookies, CSRF protection, "Remember me" persistence
- Account balance, recent transactions, and transfer history
- Money transfers between registered users with per-transfer and daily limits
- FX support: ILS, USD, EUR with live exchange rates

### AI Assistant
- Conversational banking powered by a [LangGraph](https://github.com/langchain-ai/langgraphjs) agent
- **20+ tools** — balance checks, transfer quotes, transaction search, counterparty memory, receipt lookup, daily usage stats, and more
- **Human-in-the-loop**: the agent prepares a transfer draft and stores it server-side; the user explicitly confirms or denies before anything executes
- Slot-aware clarification: the agent resolves ambiguous amounts (e.g. "half my balance"), currencies, and counterparty references from conversation context
- Persona layer and response-style guardrails keep the assistant on-brand

### Video Sessions
- In-app Jitsi meetings between users
- Agent-surfaced video session CTAs based on conversation context
- Audit log for session history

### UI
- Dashboard styled as a printed account statement with a rough paper texture
- Framer Motion transitions and a GLSL shader background
- Responsive, accessible component library built on Tailwind + Radix primitives

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Framer Motion, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB + Mongoose (default); PostgreSQL + Drizzle (opt-in, Phase 1) |
| AI | LangGraph (JS), LangChain OpenAI, Zod |
| Auth | HttpOnly JWT cookies, CSRF tokens |
| Email | Resend |
| Video | Jitsi Meet SDK |
| Monorepo | npm workspaces |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

npm workspaces hoists everything to the root `node_modules/` — no separate installs needed.

### 2. Configure environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env   # if present
```

Edit `server/.env` and set at minimum:

```env
VIRLY_MONGODB_URI=mongodb://localhost:27017/virly
VIRLY_JWT_SECRET=<a long random secret>
```

### 3. Start MongoDB

Use a local instance or point `VIRLY_MONGODB_URI` at MongoDB Atlas.

### 4. Run

```bash
# Backend (http://localhost:3000)
npm run dev:server

# Frontend (http://localhost:5173) — in a second terminal
npm run dev:client
```

### 5. Seed (optional)

```bash
npm run seed:personal-details   # fills display names
npm run seed:transactions       # generates sample ledger entries
```

---

## Database driver: MongoDB → PostgreSQL (Phase 1)

All data access goes through a repository seam, so the backing store is selected
at boot by `VIRLY_DB_DRIVER` (`mongo`, the default, or `postgres`). The two
drivers are behaviourally equivalent — proven by a contract test suite that runs
every repository case against **both** real databases.

**Phase-1 hybrid:** even in postgres mode the app still connects to Mongo, because
the LangGraph checkpointer/store remain on Mongo. Only the application
repositories move to Postgres. Postgres has no native TTL, so a sweeper deletes
expired `ai_conversations`/`ai_pending_transfers` (replacing the Mongo `expires`
indexes); active-row queries already filter `expires_at > now()`.

### Run the tests against real databases

```bash
docker compose -f docker-compose.test.yml up -d   # postgres:5433, mongo:27018
CONTRACT_PG_URL=postgres://virly:virly@localhost:5433/virly \
CONTRACT_MONGO_URL="mongodb://localhost:27018/virly_contract?directConnection=true" \
  npm run test:contract --workspace server
```

The contract suite self-skips a driver when its `CONTRACT_*` URL is unset, so the
default `npm test` stays green with no database. Note: the dockerised single-node
replica set advertises its container host, so connect from the host with
`?directConnection=true` (not `?replicaSet=rs0`).

### Cutover runbook (Mongo → Postgres)

1. Provision Postgres and set `VIRLY_POSTGRES_URL`.
2. `npm run db:migrate --workspace server` — apply the Drizzle schema.
3. During a brief write-freeze window:
   `tsx scripts/sync-mongo-to-postgres.ts` (run from `server/`) — copies every
   collection (idempotent upsert by `id`).
4. `tsx scripts/verify-parity.ts` — must report **all entities match** (it exits
   non-zero on any count/checksum mismatch).
5. Set `VIRLY_DB_DRIVER=postgres` and restart. Migrations run automatically at
   boot and the TTL sweeper starts.

### Rollback (Postgres → Mongo)

1. During a write-freeze window: `tsx scripts/sync-postgres-to-mongo.ts` — copies
   every table back to Mongo (idempotent upsert by `_id`, preserves timestamps).
2. `tsx scripts/verify-parity.ts` — confirm all entities match.
3. Set `VIRLY_DB_DRIVER=mongo` (or unset it) and restart.

LangGraph is unaffected by either direction — it always uses Mongo.

---

## Email Verification

When `RESEND_API_KEY` is not set the backend logs the verification link to the console so the full auth flow works without an email provider.

```
POST /api/auth/register
{ "email": "user@example.com", "password": "hunter2", "phone": "+972501234567" }

GET /api/auth/verify?token=<token>
```

---

## Auth Cookies

Successful login and email verification set two cookies:

| Cookie | Flags | Purpose |
|---|---|---|
| `virly_auth` | HttpOnly, Secure | JWT session |
| `virly_csrf` | Secure, readable | CSRF double-submit |

Unsafe requests (`POST`, `PUT`, `PATCH`, `DELETE`) must include `X-CSRF-Token`. The frontend reads it from the login response or the `virly_csrf` cookie as a fallback.

Cookies use `SameSite=Lax` by default. For cross-origin deployments (e.g. Vercel frontend + Render API) set `VIRLY_COOKIE_SAME_SITE=none` on the server.

---

## Deploy (Vercel + Render + Atlas)

**Vercel (client)**

```env
VITE_API_BASE_URL=https://<your-render-api>.onrender.com
```

**Render (server)**

```env
VIRLY_MONGODB_URI=<your-atlas-connection-string>
VIRLY_JWT_SECRET=<long random secret>
VIRLY_CLIENT_URL=https://<your-vercel-app>.vercel.app
VIRLY_SERVER_URL=https://<your-render-api>.onrender.com
VIRLY_COOKIE_SAME_SITE=none
RESEND_API_KEY=<your-resend-api-key>
VIRLY_EMAIL_FROM=Virly <verify@your-verified-domain.com>
```

`VIRLY_CLIENT_URL` accepts a comma-separated list of origins for staging + production previews. Do not use a wildcard when `credentials: "include"` is active.

The Resend sender domain must be verified before emails reach external inboxes.

---

## Project Structure

```
virly/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── app/                # Router, shell, guards
│       ├── components/         # Shared UI primitives
│       └── features/           # auth · dashboard · transfer · transactions
│                                 currency · users · video · settings
├── server/          # Express backend
│   └── src/
│       ├── ai/                 # LangGraph agent, tools, state, evals
│       ├── models/             # Mongoose schemas
│       ├── routes/             # Express route handlers
│       ├── services/           # Business logic layer
│       └── middleware/         # Auth, CSRF, error handling
└── scripts/         # Seed scripts and dev utilities
```

---

## Support MCP server (read-only)

Virly exposes its read-only assistant capabilities to internal support/ops staff
over the [Model Context Protocol](https://modelcontextprotocol.io) — the same
executors the in-app assistant uses, plus the policy/loan knowledge base, as MCP
tools (e.g. for Claude Desktop). It is **read-only and customer-scoped by email**;
there is no money movement by design.

Tools: `lookup_customer`, `get_balance`, `get_recent_transactions`,
`get_transfer_limits`, `get_daily_transfer_usage`, `get_pending_transfers`,
`get_counterparty_summary`, `search_policy_docs`, `list_fraud_flags`,
`list_held_transfers`.

Run it (stdio):

```bash
npm run mcp:support --workspace server
```

It uses the same env as the server (`VIRLY_MONGODB_URI`/`VIRLY_DB_DRIVER`, and
`VIRLY_AI_PG_URL` + `OPENAI_API_KEY` for `search_policy_docs`). Example Claude
Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "virly-support": {
      "command": "npm",
      "args": ["run", "mcp:support", "--workspace", "server"],
      "cwd": "/absolute/path/to/virly",
      "env": { "VIRLY_MONGODB_URI": "mongodb://localhost:27017/virly" }
    }
  }
}
```

Run it with read-scoped database credentials — every tool only reads.

---

## License

MIT
