# Graph v2 — Prompts & Tool Catalog

The model's fluency and correctness live almost entirely here: the **system
prompt** (who it is, what it may do, how to talk) and the **tool descriptions**
(its API documentation). This file is the draft source for both.

---

## 1. System prompt skeleton

Assembled per turn by `buildSystemPrompt(...)`. The large stable prefix
(sections A–E) is prompt-cached; the small tail (F–G) changes per turn.

```text
[A. IDENTITY]
You are {assistant.name}, the Virly banking assistant. {assistant.role}
You help an authenticated user manage their own money: check balances and
transactions, understand who they pay and get paid by, and prepare transfers.
Talk like a sharp, warm human assistant — natural, concise, and genuinely
conversational. This is a chat, not a form.

[B. LANGUAGE]
Mirror the user's language exactly. If they write Hebrew, answer in Hebrew; if
English, English; if mixed, match their mix. Never inject untranslated phrases.

[C. WHAT YOU CAN DO — and how]
You have tools that read this user's real account data and that prepare
transfers. Decide what the user wants from the whole conversation and call the
tools you need — in parallel when independent, in sequence when one feeds the
next. Examples of good tool use:
- "what's my balance and who did I pay last?" -> getBalance + getLastSent (parallel)
- "how much did I send Maya?" -> findCounterparty("Maya") then getTotals(direction:"sent")
- "show me those" (after a totals answer) -> getCounterpartyTransactions for that person
Never answer account questions from memory or guesses — always read a tool.
Never compute totals/balances yourself — the tools return authoritative numbers.

[D. RESOLVING REFERENCES]
You have the full conversation. Resolve "him/her/them/that one/the second one/
the same amount/the one we discussed/אותו/אליה/הסכום שדיברנו עליו" from the prior
turns yourself. If a person is named but you don't have their email, call
findCounterparty and let it resolve — never invent or guess an email. If
findCounterparty returns several candidates or none, ASK the user a short, natural
clarifying question and stop; their next message will answer it.

[E. MONEY — the confirmation rule]
You can PREPARE a transfer with prepareTransfer; you can NEVER execute, confirm,
or cancel one yourself. prepareTransfer shows the user a confirmation card with a
Confirm button — only their click moves money. So:
- To send money, resolve the recipient and amount, then call prepareTransfer.
- If the user changes a pending transfer ("make it 100", "send it to Dan
  instead"), call prepareTransfer/modifyPendingTransfer again with only the
  changed field; the existing card is in context.
- After a transfer actually executes (you'll get a tool result saying so), tell
  the user truthfully and warmly. NEVER claim money was sent before that result.
- If you're missing the recipient or amount, ask — don't prepare a half-card.

[F. WHAT YOU KNOW ABOUT THIS USER]   <- per-turn, from the Store
Known counterparties: {memoryContext.counterparties}     // name -> masked email, relation
Preferences: {memoryContext.preferences}                 // language, default confirm threshold, ...
Earlier in this conversation (summary): {runningSummary}  // when the thread was trimmed

[G. CONTEXT]
Today is {now} ({timezone}). The user is authenticated; you only ever see and act
on their own account.

[H. RESPONSE STYLE]   <- personality, reused from assistants.ts/responseStyle.ts
{personality phrase-pack guidance for the situation}
Put the concrete financial fact first (amount, recipient, status, what's
missing). Personality is a light tone layer; it must never obscure numbers,
confirmations, or warnings. Structured details (balances, lists, cards) render
from the UI blocks the tools produced — write only a short, natural intro
sentence; do NOT restate every number as Markdown or build tables yourself.
```

Why each section exists:

- **B** replaces all of v1's regex language detection and bilingual prompt
  branching.
- **C/D** replace the intent classifier, the `intent → tool` map, the
  counterparty-resolver node, and the `TurnDelta` resolver — the model does this
  natively because it has the thread.
- **E** is the prose form of the **money invariant**; it's reinforced
  structurally (the model has no execute tool).
- **F** is the long-term-memory injection — the "remembers me" feel.
- **H** preserves the v1 wins that are genuinely good: personality-as-tone and
  structured-blocks-are-authoritative.

---

## 2. Tool catalog

Each tool: a `name`, a `description` (what the model reads), and a Zod `schema`.
Descriptions are written *for the model* — say when to use it, what it returns,
and give a tiny example. Identity (`userId`, `now`, `timezone`) is **never** a
parameter; it comes from `config.configurable`.

### Accounts

```ts
getAccounts: {
  description:
    "List the user's own accounts (name, type, masked number, currency). Use for " +
    "'what accounts do I have', 'my account summary', or before a balance question " +
    "when the account is ambiguous.",
  schema: z.object({})
}

getBalance: {
  description:
    "Get the current balance / available funds for one account. Omit accountId for " +
    "the primary account. Use for 'what's my balance', 'how much do I have', 'כמה יש לי'.",
  schema: z.object({
    accountId: z.string().optional()
      .describe("Specific account id; omit for the primary/default account.")
  })
}
```

### Transactions

```ts
searchTransactions: {
  description:
    "Search / list / count / summarize the user's transactions with filters. This is " +
    "the one tool for transaction history. Set mode: 'list' to show rows, 'count' for " +
    "how many, 'stats' for totals/averages/grouping. Use for 'recent transactions', " +
    "'transfers over 100 last week', 'how many payments this month', 'summarize my " +
    "spending', 'my transfer status', 'העברות מעל 100 משבוע שעבר'.",
  schema: z.object({
    mode: z.enum(["list","count","stats"]).default("list"),
    direction: z.enum(["sent","received","both"]).default("both"),
    counterpartyEmail: z.string().optional()
      .describe("Restrict to one counterparty (use the email findCounterparty returned)."),
    dateRange: z.object({ from: z.string().optional(), to: z.string().optional() }).optional()
      .describe("ISO dates; resolve natural language like 'last week' to a range yourself."),
    amountRange: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    reasonContains: z.string().optional(),
    textContains: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
    sort: z.enum(["newest","oldest","amount_desc","amount_asc"]).default("newest")
  })
}

getTransactionReceipt: {
  description:
    "Full detail/receipt for one transaction. Use for 'show the receipt for the second " +
    "one' / 'tell me more about that transfer' — pass the transactionId from the list you " +
    "just showed (you have it in context).",
  schema: z.object({ transactionId: z.string() })
}
```

### Counterparties

```ts
findCounterparty: {
  description:
    "Resolve a person the user refers to (by name, nickname, pronoun, ordinal, or email) " +
    "to one or more known counterparties. Call this BEFORE counterparty-specific tools " +
    "when you don't already have the email from context. Returns 0, 1, or several " +
    "candidates with masked emails. If several or none, ASK the user which one — never guess. " +
    "Examples: 'Maya', 'the second person we discussed', 'him', 'dan@x.com'.",
  schema: z.object({
    query: z.string().describe("The user's words for the person, verbatim."),
    relationHint: z.enum(["sent_to","received_from","any"]).default("any")
  })
}

getCounterpartySummary: {
  description:
    "Overall relationship with one counterparty: total sent, total received, net, count, " +
    "last interaction. Use for 'what's my history with Maya', 'summarize my activity with Dan'.",
  schema: z.object({ counterpartyEmail: z.string() })
}

getCounterpartyTransactions: {
  description:
    "List transactions with one counterparty. Use for 'show transfers to Maya', 'payments " +
    "with Dan', 'show me those' after naming a person.",
  schema: z.object({
    counterpartyEmail: z.string(),
    direction: z.enum(["sent","received","both"]).default("both"),
    limit: z.number().int().min(1).max(50).default(10)
  })
}

getTotals: {
  description:
    "Total money sent to / received from / net with one counterparty. Use for 'how much " +
    "did I send Dan', 'how much did Maya send me', 'what's the net between us', " +
    "'כמה העברתי לו', 'מה הנטו בינינו'. net = received - sent.",
  schema: z.object({
    counterpartyEmail: z.string(),
    direction: z.enum(["sent","received","net"])
  })
}

getRecentSent / getRecentReceived: {
  description:
    "The most recent distinct people the user SENT money to / RECEIVED money from. Use for " +
    "'who did I pay recently', 'who sent me money this week', 'למי שלחתי לאחרונה'.",
  schema: z.object({ limit: z.number().int().min(1).max(10).default(5),
                     dateRange: z.object({ from: z.string().optional(),
                                           to: z.string().optional() }).optional() })
}

getLastSent: {
  description: "Who the user most recently sent money to. Use for 'who did I last pay', " +
    "'מי היה הנמען האחרון'.",
  schema: z.object({})
}

getVerifiedRecipients: {
  description: "The user's saved/verified recipients (eligible payees). Use for 'who can I " +
    "send to', 'my saved recipients', 'is X a verified recipient'.",
  schema: z.object({})
}
```

### Transfer preflight (read-only)

```ts
getTransferLimits:       z.object({})                       // per-transfer & daily limits
checkTransferEligibility:z.object({ amount: z.number() })   // "can I send 500?"
getTransferQuote:        z.object({ counterpartyEmail: z.string(), amount: z.number() })
getDailyTransferUsage:   z.object({})                       // used/remaining today
getPendingTransfers:     z.object({})                       // list AI confirmation cards awaiting action
```

Descriptions follow the same pattern (when-to-use + one example each). The model
uses `getTransferQuote`/`checkTransferEligibility` to *preview* before committing
to `prepareTransfer`.

### Money actions

```ts
prepareTransfer: {
  description:
    "PREPARE (not send) a transfer: builds a confirmation card the user must click to " +
    "execute. Call this when the user wants to send/pay/transfer money and you have a " +
    "recipient and a positive amount. Pass recipientEmail if you have it from a prior " +
    "findCounterparty result, otherwise recipientQuery (the person's name/words) and the " +
    "backend will resolve it. Amount is a positive number in ILS. If recipient or amount is " +
    "missing or ambiguous, DON'T call this — ask the user instead. This NEVER moves money; " +
    "only the user's Confirm click does.",
  schema: z.object({
    recipientEmail: z.string().optional()
      .describe("Use only an email you got from findCounterparty or the user typed verbatim."),
    recipientQuery: z.string().optional()
      .describe("The person's name/words if you don't have a resolved email."),
    amount: z.number().positive().describe("Positive amount in ILS."),
    reason: z.string().optional()
  })
}

modifyPendingTransfer: {
  description:
    "Change the active pending confirmation card (amount, recipient, or reason). Use for " +
    "'actually make it 100', 'send it to Dan instead', 'add a reason: rent'. Only include " +
    "the fields that change; the rest carry over from the current card. Supersedes the old card.",
  schema: z.object({
    amount: z.number().positive().optional(),
    recipientEmail: z.string().optional(),
    recipientQuery: z.string().optional(),
    reason: z.string().optional()
  })
}

cancelPendingTransfer: {
  description:
    "Discard the active pending confirmation card (the user changed their mind before " +
    "confirming). Use for 'cancel that', 'never mind', 'תבטל'. This only drops the draft " +
    "card; it does not touch completed transfers.",
  schema: z.object({})
}
```

> **Note on the F2 rule (v1):** in v1, an email appearing inside an *amount*
> clause ("the same amount sga@x.com sent me") could wrongly become the
> recipient, and a whole structural fix existed for it. In v2 it can't happen:
> recipient and amount are *separate tool arguments* with separate descriptions,
> and the model is told to resolve recipients only via `findCounterparty` /
> verbatim user emails. "Send Maya the same amount sga sent me" → the model calls
> `getTotals` (or reads context) for the sga figure and `prepareTransfer` with
> `recipientQuery: "Maya"`.

---

## 3. Worked transcripts

These show the *intended* model behavior (tool calls in brackets). They double as
eval scenarios (Phase 10).

### 3.1 Multi-turn read-only with coreference (English)

```
User: how much did I send Maya this month?
  [findCounterparty("Maya") -> 1 candidate m***@ex.com]
  [getTotals(m***, "sent")]  +  [searchTransactions(mode:"stats", counterparty:m***, dateRange:thisMonth)]
Asst: This month you've sent Maya ₪320 across 4 transfers.   (+ stats card)

User: and to Dan?
  [findCounterparty("Dan") -> 1 candidate d***@ex.com]
  [getTotals(d***, "sent")]
Asst: To Dan it's ₪150 this month.

User: show me those
  [getCounterpartyTransactions(d***, "sent")]
Asst: Here are your transfers to Dan:   (+ list card)
```
No frame, no regex — "and to Dan?" and "those" resolve from the thread.

### 3.2 Transfer with modify + confirm (Hebrew)

```
User: תעביר למאיה את אותו סכום ששלחתי לדן השבוע
  [reads thread: "Dan this month" = ₪150 already known, OR getTotals(d***,"sent")]
  [findCounterparty("מאיה") -> m***]
  [prepareTransfer(recipientEmail:m***, amount:150)]
Asst: הכנתי העברה של ₪150 למאיה — אשר/י בכרטיס.    (card shown; graph paused)

User: בעצם תעשה 200
  [modifyPendingTransfer(amount:200)]   (supersedes card)
Asst: עדכנתי ל-₪200 למאיה. לאשר?

User: *clicks Confirm*  -> POST /confirmations/:id {confirm, version}
  [resume -> executeTransfer -> respondToAiPendingTransfer(confirm)]
Asst: בוצע — ₪200 בדרך למאיה. ✅
```
"את אותו סכום ששלחתי לדן" and "תעשה 200" are resolved by the model from context;
money moves exactly once, only after the click.

### 3.3 Ambiguity → natural clarification (no state machine)

```
User: send 50 to maya
  [findCounterparty("maya") -> 2 candidates: m***@a.com, m***@b.com]
Asst: I have two Mayas — m***@a.com or m***@b.com?   (no card yet, graph just answers)

User: the second one
  [model maps "the second one" -> m***@b.com from its own previous message]
  [prepareTransfer(recipientEmail:m***@b.com, amount:50)]
Asst: Got it — ₪50 to m***@b.com. Confirm on the card.
```
The clarifying question is an ordinary turn; the checkpointer keeps the candidate
list in context so "the second one" just works.

---

## 4. Eval grading hooks (for Phase 10)

For each transcript step, two assertions:

- **Tool-call assertion** (cheap, deterministic): the expected tool(s) were
  called with the expected key args (e.g. step 3.2 turn 2 must call
  `modifyPendingTransfer` with `amount:200` and must NOT call `prepareTransfer`
  fresh). Catches regressions in tool selection without a model judge.
- **LLM-as-judge** (faithful + fluent): the final text is in the user's language,
  states the right figure, invents no numbers, and reads naturally. Graded
  against the tool results as ground truth.

Transfer goldens additionally assert: exactly one `executeTransferWithSession`
call on confirm, zero on deny/cancel, and supersede-not-duplicate on modify.
