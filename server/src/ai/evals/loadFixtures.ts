import { readFileSync } from "node:fs";

import type {
  AiEvalFixtureFile,
  AiEvalScenario,
  AiEvalScenarioSetup,
  AiEvalTurnExpectation
} from "./types.js";

const fixtureFileNames = [
  "conversations.transfer-context.json",
  "conversations.counterparty-history.json",
  "conversations.hebrew-mixed.json",
  "conversations.pending-confirmations.json"
] as const;

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function parseTurnExpectation(
  raw: unknown,
  fixtureName: string,
  scenarioId: string,
  index: number
): AiEvalTurnExpectation {
  const record = assertObject(
    raw,
    `${fixtureName} scenario ${scenarioId} turn ${index}`
  );

  return {
    userMessage: assertString(
      record.userMessage,
      `${fixtureName} scenario ${scenarioId} turn ${index} userMessage`
    ),
    expectedIntent:
      typeof record.expectedIntent === "string"
        ? (record.expectedIntent as AiEvalTurnExpectation["expectedIntent"])
        : undefined,
    expectedToolCalls: Array.isArray(record.expectedToolCalls)
      ? record.expectedToolCalls.map((value, toolIndex) =>
          assertString(
            value,
            `${fixtureName} scenario ${scenarioId} turn ${index} expectedToolCalls[${toolIndex}]`
          )
        ) as AiEvalTurnExpectation["expectedToolCalls"]
      : undefined,
    expectedConfirmation:
      record.expectedConfirmation &&
      typeof record.expectedConfirmation === "object" &&
      !Array.isArray(record.expectedConfirmation)
        ? {
            recipientEmail:
              typeof (record.expectedConfirmation as Record<string, unknown>)
                .recipientEmail === "string"
                ? ((record.expectedConfirmation as Record<string, unknown>)
                    .recipientEmail as string)
                : undefined,
            amount:
              typeof (record.expectedConfirmation as Record<string, unknown>)
                .amount === "number"
                ? ((record.expectedConfirmation as Record<string, unknown>)
                    .amount as number)
                : undefined
          }
        : undefined,
    mustInclude: Array.isArray(record.mustInclude)
      ? record.mustInclude.map((value, includeIndex) =>
          assertString(
            value,
            `${fixtureName} scenario ${scenarioId} turn ${index} mustInclude[${includeIndex}]`
          )
        )
      : undefined,
    mustNotInclude: Array.isArray(record.mustNotInclude)
      ? record.mustNotInclude.map((value, excludeIndex) =>
          assertString(
            value,
            `${fixtureName} scenario ${scenarioId} turn ${index} mustNotInclude[${excludeIndex}]`
          )
        )
      : undefined,
    mustAskClarification:
      typeof record.mustAskClarification === "boolean"
        ? record.mustAskClarification
        : undefined
  };
}

function parseScenarioSetup(
  raw: unknown,
  fixtureName: string,
  scenarioId: string
): AiEvalScenarioSetup | undefined {
  if (raw == null) {
    return undefined;
  }

  const record = assertObject(raw, `${fixtureName} scenario ${scenarioId} setup`);
  const setup: AiEvalScenarioSetup = {};

  if (Array.isArray(record.rememberedCounterparties)) {
    setup.rememberedCounterparties = record.rememberedCounterparties.map(
      (value, index) =>
        assertString(
          value,
          `${fixtureName} scenario ${scenarioId} setup.rememberedCounterparties[${index}]`
        )
    );
  }

  if (record.pendingConfirmation != null) {
    const pending = assertObject(
      record.pendingConfirmation,
      `${fixtureName} scenario ${scenarioId} setup.pendingConfirmation`
    );
    const pendingConfirmation = {
      recipientEmail: assertString(
        pending.recipientEmail,
        `${fixtureName} scenario ${scenarioId} setup.pendingConfirmation.recipientEmail`
      ),
      amount:
        typeof pending.amount === "number"
          ? pending.amount
          : (() => {
              throw new Error(
                `${fixtureName} scenario ${scenarioId} setup.pendingConfirmation.amount must be a number`
              );
            })(),
      currency: assertString(
        pending.currency,
        `${fixtureName} scenario ${scenarioId} setup.pendingConfirmation.currency`
      ) as NonNullable<AiEvalScenarioSetup["pendingConfirmation"]>["currency"],
      version:
        typeof pending.version === "number" ? pending.version : undefined
    };
    setup.pendingConfirmation = pendingConfirmation;
  }

  if (record.counterpartyResolver != null) {
    const resolver = assertObject(
      record.counterpartyResolver,
      `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver`
    );
    const status = assertString(
      resolver.status,
      `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.status`
    );
    if (status === "resolved") {
      setup.counterpartyResolver = {
        status,
        email: assertString(
          resolver.email,
          `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.email`
        ),
        displayName:
          typeof resolver.displayName === "string"
            ? resolver.displayName
            : undefined
      };
    } else if (status === "ambiguous") {
      if (!Array.isArray(resolver.candidates) || resolver.candidates.length === 0) {
        throw new Error(
          `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.candidates must be a non-empty array`
        );
      }

      setup.counterpartyResolver = {
        status,
        candidates: resolver.candidates.map((candidate, index) => {
          const record = assertObject(
            candidate,
            `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.candidates[${index}]`
          );
          return {
            email: assertString(
              record.email,
              `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.candidates[${index}].email`
            ),
            displayName: assertString(
              record.displayName,
              `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.candidates[${index}].displayName`
            )
          };
        })
      };
    } else {
      throw new Error(
        `${fixtureName} scenario ${scenarioId} setup.counterpartyResolver.status must be "resolved" or "ambiguous"`
      );
    }
  }

  return setup;
}

function parseScenario(raw: unknown, fixtureName: string, index: number): AiEvalScenario {
  const record = assertObject(raw, `${fixtureName} scenario ${index}`);
  const id = assertString(record.id, `${fixtureName} scenario ${index} id`);
  const toolPreset = assertString(
    record.toolPreset,
    `${fixtureName} scenario ${id} toolPreset`
  ) as AiEvalScenario["toolPreset"];
  const turns = Array.isArray(record.turns)
    ? record.turns.map((turn, turnIndex) =>
        parseTurnExpectation(turn, fixtureName, id, turnIndex)
      )
    : (() => {
        throw new Error(`${fixtureName} scenario ${id} turns must be an array`);
      })();

  if (turns.length === 0) {
    throw new Error(`${fixtureName} scenario ${id} must include at least one turn`);
  }

  return {
    id,
    description: assertString(
      record.description,
      `${fixtureName} scenario ${id} description`
    ),
    toolPreset,
    setup: parseScenarioSetup(record.setup, fixtureName, id),
    turns
  };
}

function parseFixtureFile(raw: string, fixtureName: string): AiEvalFixtureFile {
  const parsed = JSON.parse(raw) as unknown;
  const record = assertObject(parsed, fixtureName);
  const scenarios = Array.isArray(record.scenarios)
    ? record.scenarios.map((scenario, index) =>
        parseScenario(scenario, fixtureName, index)
      )
    : (() => {
        throw new Error(`${fixtureName} scenarios must be an array`);
      })();

  return {
    suiteName: assertString(record.suiteName, `${fixtureName} suiteName`),
    scenarios
  };
}

export function loadAiEvalFixtureFiles(): AiEvalFixtureFile[] {
  return fixtureFileNames.map((fileName) => {
    const raw = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
    return parseFixtureFile(raw, fileName);
  });
}
