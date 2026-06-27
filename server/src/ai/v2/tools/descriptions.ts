/**
 * Natural-language tool descriptions the model reads (doc 03 §2).
 *
 * Tool-selection quality is dominated by the description: each says when to use
 * the tool, what it returns, and gives a tiny bilingual example.
 */

export const GET_ACCOUNTS_DESC =
  "List the user's own accounts (name, type, masked number, currency). Use for " +
  "'what accounts do I have', 'my account summary', or before a balance question " +
  "when the account is ambiguous.";

export const GET_BALANCE_DESC =
  "Get the current balance / available funds for one account. Omit accountId for " +
  "the primary account. Use for 'what's my balance', 'how much do I have', 'כמה יש לי'.";

export const SEARCH_TRANSACTIONS_DESC =
  "Search / list / count / summarize the user's transactions with filters. This is " +
  "the one tool for transaction history. Set mode 'list' to show rows, 'count' for " +
  "how many, 'stats' for totals/averages. Use for 'recent transactions', 'transfers " +
  "over 100 last week', 'how many payments this month', 'summarize my spending', " +
  "'העברות מעל 100 משבוע שעבר'. Each returned row has a transactionId you can pass to " +
  "getTransactionReceipt for 'the second one'.";

export const GET_TRANSACTION_RECEIPT_DESC =
  "Full detail/receipt for one transaction. Use for 'show the receipt for the second " +
  "one' / 'tell me more about that transfer' — pass the transactionId from the list " +
  "you just showed (it is in the prior tool result).";

export const FIND_COUNTERPARTY_DESC =
  "Resolve a person the user refers to (by name, nickname, pronoun, ordinal, or email) " +
  "to one or more known counterparties. Call this BEFORE counterparty-specific tools " +
  "when you don't already have the email from context or the known-counterparties list. " +
  "Returns 0, 1, or several candidates. If several or none, ASK the user which one — " +
  "never guess. Examples: 'Rani', 'the second person we discussed', 'him', 'dan@x.com'.";

export const GET_COUNTERPARTY_SUMMARY_DESC =
  "Overall relationship with one counterparty: total sent, total received, net, count, " +
  "last interaction. Use for 'what's my history with Rani', 'summarize my activity with Dan'.";

export const GET_COUNTERPARTY_TRANSACTIONS_DESC =
  "List transactions with one counterparty. Use for 'show transfers to Rani', 'payments " +
  "with Dan', 'show me those' after naming a person.";

export const GET_TOTALS_DESC =
  "Total money sent to / received from / net with one counterparty. Use for 'how much " +
  "did I send Dan', 'how much did Rani send me', 'what's the net between us', " +
  "'כמה העברתי לו', 'מה הנטו בינינו'. net = received - sent. Pass the counterparty's " +
  "email (from the known-counterparties list or findCounterparty) and the direction.";

export const GET_RECENT_SENT_DESC =
  "The most recent distinct people the user SENT money to. Use for 'who did I pay " +
  "recently', 'למי שלחתי לאחרונה'.";

export const GET_RECENT_RECEIVED_DESC =
  "The most recent distinct people the user RECEIVED money from. Use for 'who sent me " +
  "money this week', 'ממי קיבלתי כסף לאחרונה'.";

export const GET_LAST_SENT_DESC =
  "Who the user most recently sent money to. Use for 'who did I last pay', 'מי היה הנמען האחרון'.";

export const GET_VERIFIED_RECIPIENTS_DESC =
  "The user's saved/verified recipients (eligible payees). Use for 'who can I send to', " +
  "'my saved recipients', 'is X a verified recipient'.";

export const GET_TRANSFER_LIMITS_DESC =
  "The user's per-transfer and daily transfer limits. Use for 'what's my transfer limit', " +
  "'how much can I send at once'.";

export const CHECK_TRANSFER_ELIGIBILITY_DESC =
  "Whether the user can send a given amount right now. Use for 'can I send 500?', " +
  "'אפשר להעביר 500?'.";

export const GET_TRANSFER_QUOTE_DESC =
  "Preview the outcome of a transfer (fees, currency) without creating it. Use for " +
  "'what would happen if I send 50 to Dan?'.";

export const GET_DAILY_TRANSFER_USAGE_DESC =
  "How much of today's daily transfer limit is used / remaining. Use for 'how much can " +
  "I still send today', 'כמה נשאר לי לשלוח היום'.";

export const GET_PENDING_TRANSFERS_DESC =
  "List transfer confirmation cards awaiting the user's action. Use for 'do I have " +
  "pending confirmations', 'יש לי העברות שמחכות לאישור'.";

export const PREPARE_TRANSFER_DESC =
  "PREPARE (not send) a transfer: builds a confirmation card the user must click to " +
  "execute. Call this when the user wants to send/pay/transfer money and you have a " +
  "recipient and a positive amount. Pass recipientEmail if you have it (from the " +
  "known-counterparties list or a prior findCounterparty result), otherwise recipientQuery " +
  "(the person's name/words). Amount is a positive number in ILS. If recipient or amount " +
  "is missing or ambiguous, DON'T call this — ask the user instead. This NEVER moves money; " +
  "only the user's Confirm click does.";

export const MODIFY_PENDING_TRANSFER_DESC =
  "Change the active pending confirmation card (amount, recipient, or reason). Use for " +
  "'actually make it 100', 'make it double', 'send it to Dan instead', 'בעצם תעשה את זה 100'. " +
  "Only include the fields that change; the rest carry over from the current card. " +
  "Supersedes the old card. Compute the new amount yourself (e.g. 'double' of 200 is 400).";

export const SEARCH_POLICY_DOCS_DESC =
  "Search Virly's internal knowledge base of policy documents and loan-package " +
  "information (semantic / meaning-based search, not the user's transactions). Use " +
  "for questions about products, eligibility, terms, fees, rates, or company policy — " +
  "e.g. 'what loan packages do you offer', 'what's the early-repayment policy', " +
  "'איזה מסלולי הלוואה יש'. Returns the most relevant document excerpts with numbered " +
  "citations; ground your answer in them and cite by [number]. If nothing relevant " +
  "comes back, say you don't have that in the knowledge base — do NOT invent terms.";

export const CANCEL_PENDING_TRANSFER_DESC =
  "Discard the active pending confirmation card (the user changed their mind before " +
  "confirming). Use for 'cancel that', 'never mind', 'תבטל'. This only drops the draft " +
  "card; it does not touch completed transfers.";
