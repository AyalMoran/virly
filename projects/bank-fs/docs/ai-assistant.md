# AI Assistant

The Virly AI assistant is a backend-only scaffold for authenticated, read-only account help. It is intentionally a retrieval and conversation layer. The backend remains the authority for all account facts and no money movement is implemented in this milestone.

## Structure

- `server/src/routes/ai.routes.ts` exposes `POST /api/ai/chat` behind the existing cookie-based `requireAuth` middleware.
- `server/src/ai/graph.ts` builds the LangGraph.js workflow for auth context, intent classification, read-only tool routing, response composition, and refusal handling.
- `server/src/ai/llm.ts` adapts `ChatOpenAI` for structured intent classification and final response wording when an OpenAI key is configured.
- `server/src/ai/assistants.ts` contains the four fixed assistant personality definitions.
- `server/src/ai/policy.ts` keeps the central safety policy and refusal messages.
- `server/src/ai/tools/` contains the only approved tools. They read from existing Mongoose models and always scope queries to the authenticated user.
- `server/src/services/aiAuditLog.service.ts` writes metadata-only audit events to MongoDB through `AiAuditLog`.

## Local Development

Run the backend:

```bash
npm run dev --workspace server
```

Build the backend:

```bash
npm run build --workspace server
```

Run AI safety tests:

```bash
npm run test --workspace server
```

Current environment variables:

- `VIRLY_AI_MOCK_PER_TRANSFER_LIMIT`, default `500`
- `VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT`, default `1000`
- `VIRLY_AI_MODEL`, default `gpt-4o-mini`
- `OPENAI_API_KEY`, optional

When `OPENAI_API_KEY` and `VIRLY_AI_MODEL` are configured, the route uses `@langchain/openai` `ChatOpenAI` for structured intent classification and final response wording. If the provider is missing or fails, the graph falls back to deterministic local classification and response composition so local development and tests do not depend on an external model.

## API

`POST /api/ai/chat`

```json
{
  "message": "What is my balance?",
  "conversationId": "optional-existing-id",
  "assistantId": "oshri"
}
```

`assistantId` is optional and defaults to `oshri`. Valid values are `oshri`, `chaya`, `yehuda`, and `yohai_daniel`.

Response:

```json
{
  "message": "Virly account Your Virly account available balance is 125.00.",
  "conversationId": "conversation-id",
  "assistantId": "oshri",
  "intent": "balance_inquiry",
  "toolCalls": ["getUserAccounts", "getAccountBalance"]
}
```

The endpoint does not accept `userId`, account ownership, or permissions from chat text. The authenticated user comes only from the HttpOnly auth cookie validated by `requireAuth`. Because this is an authenticated unsafe request, clients must also send `X-CSRF-Token` with the value from the readable `virly_csrf` cookie.

## Read-Only Boundary

Allowed tools:

- `getUserAccounts`
- `getAccountBalance`
- `getRecentTransactions`
- `getVerifiedRecipients`
- `getTransferLimits`

Forbidden for this milestone:

- `executeTransfer`
- `createTransfer`
- `cancelTransfer`
- `modifyRecipient`
- `addRecipient`
- `updateAccount`
- `changeUserData`
- Any tool that mutates money or user records

The assistant refuses requests to send money, bypass verification or limits, access another user's data, reveal system prompts, or treat chat text as transfer authorization. The code enforces this with allowlisted tool names and route separation; it does not rely only on prompt wording.

## Personalities

The client may choose one of four fixed assistant personalities. The selected personality is passed to the LLM only during response wording and is returned as `assistantId` so the chat UI can keep old messages tied to the assistant that generated them.

Personalities do not affect graph behavior. They cannot change authentication, intent routing, tool access, refusal handling, account scope, or audit behavior. Responses should match the user's message language.

## Audit Logging

AI audit logs store metadata only:

- User id
- Conversation id
- Request id when available
- Assistant id
- Detected intent
- Tools requested
- Tools executed
- Refusal reason when refused

Do not log raw financial payloads, full transaction histories, full prompts containing sensitive account details, credentials, or secrets.

## Roadmap

- Phase 1: read-only assistant, implemented now.
- Phase 2: transfer preparation / quote creation only.
- Phase 3: secure confirmation through trusted app UI.
- Phase 4: backend-executed transfer with confirmation token and idempotency key.
- Phase 5: fraud/risk review, step-up auth, and support handoff.
