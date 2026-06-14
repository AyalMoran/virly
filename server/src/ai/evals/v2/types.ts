

/**
 * Scenario + per-turn expectation types for the V2 live conformance suite.
 *
 * Expectations are deliberately PERSONALITY-AGNOSTIC: they assert on facts
 * (resolved recipient, resolved amount, surfaced numbers), structure
 * (clarification vs confirmation), and faithfulness — never on tone, openings,
 * emoji, or any assistant phrase pack.
 */

export type V2TurnExpectation = {
  /** The user's message for this turn. */
  userMessage: string;
  /** Human note: what capability this turn probes (shown in failure output). */
  probes: string;

  /** Expect the reply to be written in this language (mirroring the user). */
  expectLanguage?: "he" | "en";

  /** A transfer confirmation card must be produced for this exact recipient. */
  expectRecipientEmail?: string;
  /** A transfer confirmation card must be produced for this exact amount (ILS). */
  expectAmount?: number;

  /** The turn must ask the user a clarifying question (no card, no final answer). */
  expectClarification?: boolean;
  /** The turn must NOT create a transfer confirmation card. */
  expectNoConfirmation?: boolean;

  /** Every string here must appear in the reply (case-insensitive). Use for facts/numbers. */
  answerMustContain?: string[];
  /** None of these may appear in the reply (case-insensitive). */
  answerMustNotContain?: string[];

  /**
   * Multi-request turns: all of these facts must be addressed in one reply.
   * Same matching as answerMustContain, separated for clearer failure messages.
   */
  multiRequestParts?: string[];

  /**
   * If set, an LLM judge grades the reply against these criteria (faithfulness,
   * fluency, language). The judge sees the user message, the reply, and the
   * authoritative tool facts; it must return pass/fail + reason.
   */
  judge?: string;
};

export type V2Scenario = {
  id: string;
  title: string;
  language: "en" | "he" | "mixed";
  tags: string[];
  /**
   * Counterparty emails to pre-seed into conversation memory so the scenario
   * exercises reference/coreference reasoning rather than cold lookup. Defaults
   * to all world counterparties.
   */
  seedCounterparties?: string[];
  turns: V2TurnExpectation[];
};
