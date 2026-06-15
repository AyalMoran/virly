import process from "node:process";

import dotenv from "dotenv";
import { evaluate, type EvaluatorT } from "langsmith/evaluation";

import { runAssistant } from "../../runAssistant.js";
import { createMemoryWithCounterparties } from "../support.js";
import {
  createTransferModificationService,
  createTransferPreparationService
} from "../support.js";
import { dbFreeAmountResolutionService } from "../v2/harness.js";
import {
  WORLD,
  worldCounterpartyEmails
} from "../v2/world.js";
import { createV2WorldTools } from "../v2/worldTools.js";
import { trimConversationMessages } from "../../counterpartyMemory.js";
import type {
  ConversationContext,
  ConversationSaveInput,
  ConversationStore,
  CounterpartyMemory,
  PendingConfirmationMemory,
  RunAssistantResult
} from "../../state.js";
import {
  DEFAULT_DATASET_NAME,
  type LangSmithAssistantInputs,
  type LangSmithAssistantOutputs,
  type LangSmithExpectedTurn
} from "./schema.js";

dotenv.config();
dotenv.config({ path: "server/.env" });

type TargetTurnOutput = {
  index: number;
  input: LangSmithAssistantInputs["turns"][number];
  result: RunAssistantResult;
};

type TargetOutput = {
  turns: TargetTurnOutput[];
} & Record<string, unknown>;

function argValue(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return fallback;
}

function createPendingConfirmationMemory(
  input: NonNullable<LangSmithAssistantInputs["setup"]>["pendingConfirmation"]
): PendingConfirmationMemory | null {
  if (!input) {
    return null;
  }
  return {
    confirmationId: "pending-transfer-1",
    type: "transfer",
    status: "pending",
    createdAt: new Date("2026-06-14T10:00:00.000Z").toISOString(),
    expiresAt: new Date("2026-06-14T12:00:00.000Z").toISOString(),
    recipientEmail: input.recipientEmail,
    amount: input.amount,
    currency: input.currency === "ILS" ? "ILS" : "ILS",
    turnCreated: 1,
    version: input.version ?? 1
  };
}

function createStore(inputs: LangSmithAssistantInputs): ConversationStore {
  const setup = inputs.setup ?? {};
  const seedCounterparties =
    setup.seedCounterparties ?? worldCounterpartyEmails();
  const pendingConfirmation = createPendingConfirmationMemory(
    setup.pendingConfirmation
  );
  const baseMemory = createMemoryWithCounterparties(seedCounterparties);
  let memory: CounterpartyMemory = pendingConfirmation
    ? {
        ...baseMemory,
        pendingConfirmation,
        mode: "transfer_confirmation_pending"
      }
    : baseMemory;
  let context: ConversationContext = { messages: [], memory };

  return {
    async load() {
      return context;
    },
    async save(input: ConversationSaveInput) {
      memory = input.memory;
      context = {
        messages: trimConversationMessages(input.messages),
        memory
      };
    }
  };
}

async function runTarget(inputs: LangSmithAssistantInputs): Promise<TargetOutput> {
  if (inputs.kind !== "assistant_thread") {
    throw new Error(`Unsupported input kind: ${inputs.kind}`);
  }
  if (inputs.toolPreset !== "v2_world") {
    throw new Error(`Unsupported toolPreset: ${inputs.toolPreset}`);
  }

  const store = createStore(inputs);
  const tools = createV2WorldTools();
  const transferPreparationService = createTransferPreparationService();
  const transferModificationService = createTransferModificationService();
  const turns: TargetTurnOutput[] = [];

  for (const [index, turn] of inputs.turns.entries()) {
    const result = await runAssistant(
      {
        userId: turn.userId ?? WORLD.userId,
        conversationId: turn.conversationId,
        requestId: turn.requestId,
        assistantId: turn.assistantId,
        message: turn.message
      },
      {
        tools,
        conversationStore: store,
        amountResolutionService: dbFreeAmountResolutionService,
        transferPreparationService,
        transferModificationService
      }
    );
    turns.push({ index, input: turn, result });
  }

  return { turns };
}

function containsAll(text: string, parts: string[] | undefined) {
  return (parts ?? []).every((part) =>
    text.toLowerCase().includes(part.toLowerCase())
  );
}

function containsNone(text: string, parts: string[] | undefined) {
  return (parts ?? []).every(
    (part) => !text.toLowerCase().includes(part.toLowerCase())
  );
}

function turnFailures(
  actual: RunAssistantResult | undefined,
  expected: LangSmithExpectedTurn,
  index: number
) {
  const failures: string[] = [];
  if (!actual) {
    return [`turn ${index}: missing actual output`];
  }

  if (expected.expectedIntent && actual.intent !== expected.expectedIntent) {
    failures.push(
      `turn ${index}: expected intent ${expected.expectedIntent}, got ${actual.intent}`
    );
  }
  if (
    expected.expectedToolCallsExact &&
    JSON.stringify(actual.toolCalls) !==
      JSON.stringify(expected.expectedToolCallsExact)
  ) {
    failures.push(
      `turn ${index}: expected exact tools ${JSON.stringify(
        expected.expectedToolCallsExact
      )}, got ${JSON.stringify(actual.toolCalls)}`
    );
  }
  for (const toolName of expected.expectedToolCallsInclude ?? []) {
    if (!actual.toolCalls.includes(toolName as never)) {
      failures.push(`turn ${index}: expected tool call ${toolName}`);
    }
  }
  if (
    expected.expectedConfirmation?.recipientEmail &&
    actual.confirmation?.recipientEmail !== expected.expectedConfirmation.recipientEmail
  ) {
    failures.push(
      `turn ${index}: expected confirmation recipient ${expected.expectedConfirmation.recipientEmail}, got ${actual.confirmation?.recipientEmail ?? "none"}`
    );
  }
  if (
    typeof expected.expectedConfirmation?.amount === "number" &&
    actual.confirmation?.amount !== expected.expectedConfirmation.amount
  ) {
    failures.push(
      `turn ${index}: expected confirmation amount ${expected.expectedConfirmation.amount}, got ${actual.confirmation?.amount ?? "none"}`
    );
  }
  if (expected.expectedSupersededConfirmation && !actual.supersededConfirmationId) {
    failures.push(`turn ${index}: expected a supersededConfirmationId`);
  }
  if (
    typeof expected.mustAskClarification === "boolean" &&
    Boolean(actual.clarification) !== expected.mustAskClarification
  ) {
    failures.push(
      `turn ${index}: expected clarification=${expected.mustAskClarification}, got ${Boolean(actual.clarification)}`
    );
  }
  if (
    expected.expectedClarificationReplyType &&
    actual.clarification?.expectedReplyType !== expected.expectedClarificationReplyType
  ) {
    failures.push(
      `turn ${index}: expected clarification reply type ${expected.expectedClarificationReplyType}, got ${actual.clarification?.expectedReplyType ?? "none"}`
    );
  }
  if (expected.mustNotCreateConfirmation && actual.confirmation) {
    failures.push(`turn ${index}: expected no confirmation card`);
  }
  if (!containsAll(actual.message, expected.answerMustContain)) {
    failures.push(
      `turn ${index}: message missing one of ${JSON.stringify(expected.answerMustContain)}`
    );
  }
  if (!containsAll(actual.message, expected.multiRequestParts)) {
    failures.push(
      `turn ${index}: message missing multi-request facts ${JSON.stringify(expected.multiRequestParts)}`
    );
  }
  if (!containsNone(actual.message, expected.answerMustNotContain)) {
    failures.push(
      `turn ${index}: message included forbidden text from ${JSON.stringify(expected.answerMustNotContain)}`
    );
  }
  if (
    expected.expectedRefusalReason &&
    actual.refusalReason !== expected.expectedRefusalReason
  ) {
    failures.push(
      `turn ${index}: expected refusalReason ${expected.expectedRefusalReason}, got ${actual.refusalReason ?? "none"}`
    );
  }

  return failures;
}

const contractEvaluator = ((args: {
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}) => {
  const { outputs, referenceOutputs } = args;
  const actualTurns = (outputs as TargetOutput | undefined)?.turns ?? [];
  const expectedTurns =
    (referenceOutputs as LangSmithAssistantOutputs | undefined)?.expectedTurns ?? [];
  const failures = expectedTurns.flatMap((expected, index) =>
    turnFailures(actualTurns[index]?.result, expected, index)
  );
  return {
    key: "contract",
    score: failures.length === 0 ? 1 : 0,
    comment: failures.length === 0 ? "All structural assertions passed." : failures.join("; ")
  };
}) as EvaluatorT;

async function main() {
  const datasetName = argValue("--dataset", DEFAULT_DATASET_NAME) ?? DEFAULT_DATASET_NAME;
  const experimentPrefix = argValue(
    "--experiment-prefix",
    "virly-ai-assistant-contract"
  ) ?? "virly-ai-assistant-contract";
  const maxConcurrency = Number(argValue("--max-concurrency", "1"));

  if (!process.env.LANGSMITH_API_KEY) {
    throw new Error("LANGSMITH_API_KEY is required to run a LangSmith experiment.");
  }

  const results = await evaluate(runTarget, {
    data: datasetName,
    evaluators: [contractEvaluator],
    experimentPrefix,
    maxConcurrency
  });

  console.log(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
