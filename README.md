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
| Database | MongoDB + Mongoose |
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

## License

MIT
