

/**
 * Personality-agnostic, structural assertions for a single turn. Returns a list
 * of human-readable failure strings (empty = the turn met expectations). These
 * never inspect tone or phrasing — only facts, structure, and surfaced numbers.
 */
import type { RunAssistantResult } from "../../state.js";
import type { V2TurnExpectation } from "./types.js";

function rx(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function hasHebrew(text: string): boolean {
  return /[֐-׿]/.test(text);
}

function truncate(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Text the user actually sees: the prose message PLUS any structured response
 * blocks. Read-only answers often render figures in blocks while the prose is a
 * short intro, so number/fact assertions must search both.
 */
export function surfacedText(result: RunAssistantResult): string {
  const blocks = result.responseBlocks ? JSON.stringify(result.responseBlocks) : "";
  return `${result.message ?? ""}\n${blocks}`;
}

export function collectTurnFailures(
  scenarioId: string,
  turnIndex: number,
  expectation: V2TurnExpectation,
  result: RunAssistantResult
): string[] {
  const failures: string[] = [];
  const prefix = `${scenarioId} turn ${turnIndex} [${expectation.probes}]`;
  const message = result.message ?? "";
  const surfaced = surfacedText(result);

  if (expectation.expectLanguage === "he" && !hasHebrew(message)) {
    failures.push(`${prefix}: expected a Hebrew reply but got no Hebrew text`);
  }
  if (expectation.expectLanguage === "en" && hasHebrew(message)) {
    failures.push(`${prefix}: expected an English reply but got Hebrew characters`);
  }

  if (
    expectation.expectRecipientEmail &&
    result.confirmation?.recipientEmail !== expectation.expectRecipientEmail
  ) {
    failures.push(
      `${prefix}: confirmation recipient expected ${expectation.expectRecipientEmail} but got ${result.confirmation?.recipientEmail ?? "no confirmation"}`
    );
  }

  if (
    typeof expectation.expectAmount === "number" &&
    result.confirmation?.amount !== expectation.expectAmount
  ) {
    failures.push(
      `${prefix}: confirmation amount expected ${expectation.expectAmount} but got ${result.confirmation?.amount ?? "no confirmation"}`
    );
  }

  if (expectation.expectClarification && !result.clarification) {
    failures.push(`${prefix}: expected a clarifying question but none was asked`);
  }

  if (expectation.expectNoConfirmation && result.confirmation) {
    failures.push(
      `${prefix}: expected NO confirmation card but one was created (${result.confirmation.recipientEmail}, ${result.confirmation.amount})`
    );
  }

  for (const needle of expectation.answerMustContain ?? []) {
    if (!rx(needle).test(surfaced)) {
      failures.push(`${prefix}: reply must surface "${needle}" — got: ${truncate(surfaced)}`);
    }
  }

  for (const needle of expectation.answerMustNotContain ?? []) {
    if (rx(needle).test(surfaced)) {
      failures.push(`${prefix}: reply must NOT contain "${needle}" — got: ${truncate(surfaced)}`);
    }
  }

  for (const part of expectation.multiRequestParts ?? []) {
    if (!rx(part).test(surfaced)) {
      failures.push(
        `${prefix}: multi-request reply is missing part "${part}" — got: ${truncate(surfaced)}`
      );
    }
  }

  return failures;
}
