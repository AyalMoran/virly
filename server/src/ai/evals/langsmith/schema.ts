import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_DATASET_NAME = "Virly AI Assistant Contract";
export const EXAMPLES_FILE_URL = new URL(
  "./assistant-langsmith.examples.json",
  import.meta.url
);

export type LangSmithToolPreset = "v2_world";

export type PendingTransferSetup = {
  recipientEmail: string;
  amount: number;
  currency: "ILS" | "USD" | "EUR";
  recipientFirstName?: string;
  recipientLastName?: string;
  reason?: string | null;
};

export type PendingConfirmationSetup = {
  recipientEmail: string;
  amount: number;
  currency: "ILS" | "USD" | "EUR";
  version?: number;
};

export type LangSmithAssistantSetup = {
  seedCounterparties?: string[];
  pendingTransfers?: PendingTransferSetup[];
  pendingConfirmation?: PendingConfirmationSetup;
};

export type LangSmithRunAssistantInput = {
  userId?: string;
  conversationId: string;
  requestId?: string;
  assistantId?: "oshri" | "chaya" | "yehuda" | "yohai_daniel";
  message: string;
};

export type LangSmithAssistantInputs = {
  kind: "assistant_thread";
  contract: "RunAssistantInputSequence";
  toolPreset: LangSmithToolPreset;
  setup?: LangSmithAssistantSetup;
  turns: LangSmithRunAssistantInput[];
};

export type LangSmithExpectedTurn = {
  expectedIntent?: string;
  expectedToolCallsExact?: string[];
  expectedToolCallsInclude?: string[];
  expectedConfirmation?: {
    recipientEmail?: string;
    amount?: number;
  };
  expectedSupersededConfirmation?: boolean;
  expectedResponseLanguage?: "he" | "en";
  expectedClarificationReplyType?: string;
  expectedRefusalReason?: string;
  expectEmptyResult?: boolean;
  mustAskClarification?: boolean;
  mustNotCreateConfirmation?: boolean;
  answerMustContain?: string[];
  answerMustNotContain?: string[];
  multiRequestParts?: string[];
};

export type LangSmithAssistantOutputs = {
  expectedTurns: LangSmithExpectedTurn[];
  semanticAssertions?: string[];
};

export type LangSmithAssistantMetadata = {
  example_id: string;
  split: "smoke" | "regression" | "edge" | "safety";
  priority: "smoke" | "regression" | "edge";
  source: string;
  behaviors: string[];
  tags: string[];
};

export type LangSmithAssistantExample = {
  name: string;
  inputs: LangSmithAssistantInputs;
  outputs: LangSmithAssistantOutputs;
  metadata: LangSmithAssistantMetadata;
};

type ValidationResult = {
  examples: LangSmithAssistantExample[];
  errors: string[];
  warnings: string[];
  coverage: Map<string, string[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    return undefined;
  }
  return value;
}

function validateRunAssistantTurn(
  raw: unknown,
  label: string,
  errors: string[]
): void {
  if (!isRecord(raw)) {
    errors.push(`${label} must be an object`);
    return;
  }

  const allowed = new Set([
    "userId",
    "conversationId",
    "requestId",
    "assistantId",
    "message"
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      errors.push(`${label}.${key} is not part of RunAssistantInput`);
    }
  }

  if (raw.userId !== undefined && !isString(raw.userId)) {
    errors.push(`${label}.userId must be a non-empty string when present`);
  }
  if (!isString(raw.conversationId)) {
    errors.push(`${label}.conversationId must be a non-empty string`);
  }
  if (raw.requestId !== undefined && !isString(raw.requestId)) {
    errors.push(`${label}.requestId must be a non-empty string when present`);
  }
  if (raw.assistantId !== undefined && !isString(raw.assistantId)) {
    errors.push(`${label}.assistantId must be a non-empty string when present`);
  }
  if (!isString(raw.message)) {
    errors.push(`${label}.message must be a non-empty string`);
  }
}

function validateExpectedTurn(
  raw: unknown,
  label: string,
  errors: string[]
): void {
  if (!isRecord(raw)) {
    errors.push(`${label} must be an object`);
    return;
  }

  for (const key of [
    "expectedToolCallsExact",
    "expectedToolCallsInclude",
    "answerMustContain",
    "answerMustNotContain",
    "multiRequestParts"
  ]) {
    if (raw[key] !== undefined && !asStringArray(raw[key])) {
      errors.push(`${label}.${key} must be an array of strings`);
    }
  }

  if (
    raw.expectedConfirmation !== undefined &&
    !isRecord(raw.expectedConfirmation)
  ) {
    errors.push(`${label}.expectedConfirmation must be an object`);
  }
}

export function validateAssistantExamples(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coverage = new Map<string, string[]>();
  const seenIds = new Set<string>();
  const examples: LangSmithAssistantExample[] = [];

  if (!Array.isArray(raw)) {
    return {
      examples,
      errors: ["Examples file must be a JSON array"],
      warnings,
      coverage
    };
  }

  raw.forEach((entry, index) => {
    const label = `examples[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be an object`);
      return;
    }

    if (!isString(entry.name)) {
      errors.push(`${label}.name must be a non-empty string`);
    }

    const metadata = entry.metadata;
    if (!isRecord(metadata)) {
      errors.push(`${label}.metadata must be an object`);
      return;
    }

    if (!isString(metadata.example_id)) {
      errors.push(`${label}.metadata.example_id must be a non-empty string`);
    } else if (seenIds.has(metadata.example_id)) {
      errors.push(`${label}.metadata.example_id duplicates ${metadata.example_id}`);
    } else {
      seenIds.add(metadata.example_id);
    }

    const behaviors = asStringArray(metadata.behaviors);
    if (!behaviors || behaviors.length === 0) {
      errors.push(`${label}.metadata.behaviors must be a non-empty string array`);
    } else if (isString(metadata.example_id)) {
      for (const behavior of behaviors) {
        const existing = coverage.get(behavior) ?? [];
        existing.push(metadata.example_id);
        coverage.set(behavior, existing);
      }
    }

    if (!asStringArray(metadata.tags)) {
      errors.push(`${label}.metadata.tags must be an array of strings`);
    }

    const inputs = entry.inputs;
    if (!isRecord(inputs)) {
      errors.push(`${label}.inputs must be an object`);
      return;
    }

    if (inputs.kind !== "assistant_thread") {
      errors.push(`${label}.inputs.kind must be assistant_thread`);
    }
    if (inputs.contract !== "RunAssistantInputSequence") {
      errors.push(`${label}.inputs.contract must be RunAssistantInputSequence`);
    }
    if (inputs.toolPreset !== "v2_world") {
      errors.push(`${label}.inputs.toolPreset must be v2_world`);
    }
    if (!Array.isArray(inputs.turns) || inputs.turns.length === 0) {
      errors.push(`${label}.inputs.turns must be a non-empty array`);
    } else {
      inputs.turns.forEach((turn, turnIndex) =>
        validateRunAssistantTurn(turn, `${label}.inputs.turns[${turnIndex}]`, errors)
      );
    }

    const outputs = entry.outputs;
    if (!isRecord(outputs)) {
      errors.push(`${label}.outputs must be an object`);
      return;
    }
    if (!Array.isArray(outputs.expectedTurns)) {
      errors.push(`${label}.outputs.expectedTurns must be an array`);
    } else {
      if (
        Array.isArray(inputs.turns) &&
        outputs.expectedTurns.length !== inputs.turns.length
      ) {
        errors.push(
          `${label}.outputs.expectedTurns length must match inputs.turns length`
        );
      }
      outputs.expectedTurns.forEach((turn, turnIndex) =>
        validateExpectedTurn(turn, `${label}.outputs.expectedTurns[${turnIndex}]`, errors)
      );
    }

    examples.push(entry as LangSmithAssistantExample);
  });

  for (const required of [
    "balance_inquiry",
    "transaction_detail",
    "transfer_prepare",
    "clarification",
    "no_money_execution",
    "unsafe_request",
    "hebrew",
    "multi_turn"
  ]) {
    if (!coverage.has(required)) {
      warnings.push(`No example declares required behavior: ${required}`);
    }
  }

  return { examples, errors, warnings, coverage };
}

export function loadAssistantExamples(
  path = fileURLToPath(EXAMPLES_FILE_URL)
): LangSmithAssistantExample[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const result = validateAssistantExamples(raw);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("\n"));
  }
  return result.examples;
}
