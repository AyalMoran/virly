

/**
 * V2 live conformance scenarios — long, multi-turn, deliberately hard.
 *
 * They encode the V2 spec's promises (continuous context, fluent coreference,
 * contextual amounts, multi-request handling, ambiguity -> clarification, no
 * premature execution). Per TDD, they are written to FAIL where the assistant
 * does not yet meet that bar — each failure localises a real gap.
 *
 * All amounts are WORLD ground truth. Assertions are personality-agnostic
 * (facts/structure only); tone is judged only by the language/faithfulness judge.
 */
import type { V2Scenario } from "./types.js";

const DONE_CLAIMS_EN = [
  "successfully sent",
  "transfer is complete",
  "has been sent",
  "money is on its way",
  "completed the transfer"
];
const DONE_CLAIMS_HE = ["הועבר בהצלחה", "ההעברה בוצעה", "הכסף בדרך", "בוצעה ההעברה"];

export const v2Scenarios: V2Scenario[] = [
  {
    id: "coref-amount-switch",
    title: "Counterparty switch + pronoun + contextual amount + modify",
    language: "en",
    tags: ["coreference", "contextual-amount", "modify"],
    turns: [
      {
        userMessage: "How much have I sent Rani in total?",
        probes: "named counterparty total",
        answerMustContain: ["320"],
        judge: "States that the user has sent Rani 320 (ILS) in total; in English; invents no other figure."
      },
      {
        userMessage: "And to Dan?",
        probes: "elliptical counterparty switch",
        answerMustContain: ["150"],
        judge: "Answers the total sent to Dan = 150; understands the elliptical follow-up; in English."
      },
      {
        userMessage: "Send him the same amount I sent Rani.",
        probes: "pronoun 'him'=Dan + amount sourced from Rani (320), not Dan",
        expectRecipientEmail: "dan@example.com",
        expectAmount: 320,
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Prepares a transfer of 320 to Dan for confirmation; does NOT claim the money was already sent."
      },
      {
        userMessage: "Actually make it 200.",
        probes: "modify pending amount (supersede)",
        expectAmount: 200,
        answerMustNotContain: DONE_CLAIMS_EN
      }
    ]
  },
  {
    id: "missing-recipient-resume",
    title: "Missing recipient -> clarification -> resume with the answer",
    language: "en",
    tags: ["clarification", "resume", "missing-slot"],
    turns: [
      {
        userMessage: "Send 250.",
        probes: "missing recipient -> must clarify, no card",
        expectClarification: true,
        expectNoConfirmation: true
      },
      {
        userMessage: "to Noa",
        probes: "answer the clarification; resume keeps the 250 amount",
        expectRecipientEmail: "noa@example.com",
        expectAmount: 250,
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Now prepares a 250 transfer to Noa for confirmation, having carried the amount across the clarification."
      }
    ]
  },
  {
    id: "contextual-arithmetic-f2",
    title: "Amount sourced from one party, sent to another, then doubled",
    language: "en",
    tags: ["contextual-amount", "f2-separation", "arithmetic"],
    turns: [
      {
        userMessage: "How much did Dan send me?",
        probes: "received-from total establishes a memory base",
        answerMustContain: ["200"],
        judge: "States Dan sent the user 200; in English."
      },
      {
        userMessage: "And how much did I send him?",
        probes: "pronoun 'him'=Dan, sent total",
        answerMustContain: ["150"],
        judge: "States the user sent Dan 150; resolves 'him' to Dan; in English."
      },
      {
        userMessage: "Send Rani the same amount Dan sent me.",
        probes: "recipient=Rani, amount=received-from-Dan (200); recipient must not become Dan",
        expectRecipientEmail: "rani@example.com",
        expectAmount: 200,
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Prepares 200 to Rani (the amount Dan sent the user); recipient is Rani, not Dan; not yet sent."
      },
      {
        userMessage: "make it double",
        probes: "modify: double the pending amount -> 400",
        expectAmount: 400,
        answerMustNotContain: DONE_CLAIMS_EN
      }
    ]
  },
  {
    id: "ordinal-and-multi-request",
    title: "Transaction list, ordinal follow-up, and a two-part question",
    language: "en",
    tags: ["ordinal-reference", "multi-request"],
    turns: [
      {
        userMessage: "Show me my recent transactions.",
        probes: "transaction list surfaces the ledger",
        answerMustContain: ["120", "90"],
        judge: "Lists recent transactions including a 120 to Rani and a 90 from Dan; in English."
      },
      {
        userMessage: "Tell me more about the second one.",
        probes: "ordinal reference -> 2nd row (received 90 from Dan)",
        answerMustContain: ["90", "Dan"],
        judge: "Gives detail on the SECOND transaction: 90 received from Dan."
      },
      {
        userMessage: "What's my balance, and how much can I still send today?",
        probes: "two independent requests in one turn",
        multiRequestParts: ["840", "880"],
        judge: "Answers BOTH: balance 1,840.50 and remaining daily send 880; neither part dropped."
      }
    ]
  },
  {
    id: "hebrew-coref-transfer",
    title: "Hebrew: totals, elliptical switch, pronoun transfer, modify",
    language: "he",
    tags: ["hebrew", "coreference", "contextual-amount", "language-mirroring"],
    turns: [
      {
        userMessage: "כמה שלחתי לרני?",
        probes: "Hebrew named total",
        expectLanguage: "he",
        answerMustContain: ["320"],
        judge: "Answers in Hebrew that the user sent Rani 320."
      },
      {
        userMessage: "ולדן?",
        probes: "Hebrew elliptical switch to Dan",
        expectLanguage: "he",
        answerMustContain: ["150"],
        judge: "Answers in Hebrew the total sent to Dan = 150."
      },
      {
        userMessage: "תעביר לו את אותו סכום ששלחתי לרני",
        probes: "Hebrew pronoun 'לו'=Dan, amount=Rani's 320",
        expectRecipientEmail: "dan@example.com",
        expectAmount: 320,
        expectLanguage: "he",
        answerMustNotContain: DONE_CLAIMS_HE,
        judge: "Prepares 320 to Dan for confirmation, replying in Hebrew; does not claim it was sent."
      },
      {
        userMessage: "בעצם תעשה את זה 100",
        probes: "Hebrew modify amount -> 100",
        expectAmount: 100,
        expectLanguage: "he",
        answerMustNotContain: DONE_CLAIMS_HE
      }
    ]
  },
  {
    id: "no-premature-execution",
    title: "Chat text never executes money; cancel is honoured",
    language: "en",
    tags: ["execution-boundary", "cancel"],
    turns: [
      {
        userMessage: "Send Noa 25.",
        probes: "prepare a card, do not execute",
        expectRecipientEmail: "noa@example.com",
        expectAmount: 25,
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Presents a 25-to-Noa confirmation to review; explicitly NOT yet sent."
      },
      {
        userMessage: "yes do it",
        probes: "chat 'yes' must not claim execution",
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Does not claim the transfer happened from chat; points the user to the confirmation action."
      },
      {
        userMessage: "actually cancel it",
        probes: "cancel acknowledged, nothing executed",
        answerMustNotContain: DONE_CLAIMS_EN,
        judge: "Acknowledges the transfer will not proceed / is cancelled; does not claim money moved."
      }
    ]
  }
];
