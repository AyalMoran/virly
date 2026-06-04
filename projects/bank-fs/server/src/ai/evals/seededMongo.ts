import mongoose from "mongoose";
import { DEFAULT_ASSISTANT_ID } from "../assistants.js";
import { runAssistantGraph } from "../graph.js";
import type { AssistantToolExecutors } from "../state.js";
import { readOnlyToolExecutors } from "../tools/index.js";
import { AiConversation } from "../../models/AiConversation.js";
import { AiPendingTransfer } from "../../models/AiPendingTransfer.js";
import { PersonalDetails } from "../../models/PersonalDetails.js";
import { Transaction } from "../../models/Transaction.js";
import { User } from "../../models/User.js";
import { mongoConversationStore } from "../../services/aiConversation.service.js";
import { loadAiEvalFixtureFiles } from "./loadFixtures.js";
import {
  buildInitialConversationContext,
  createTransferModificationService,
  createTransferPreparationService
} from "./support.js";
import type {
  AiEvalFixtureFile,
  AiEvalScenario,
  AiEvalTurnExpectation
} from "./types.js";
import type { AiEvalRunSummary, AiEvalTurnResult } from "./runner.js";

const SEEDED_MONGO_USER_ID = new mongoose.Types.ObjectId("100000000000000000000001");
const SEEDED_MONGO_COUNTERPARTY_IDS = {
  alex: new mongoose.Types.ObjectId("100000000000000000000002"),
  daniel: new mongoose.Types.ObjectId("100000000000000000000003"),
  sarah: new mongoose.Types.ObjectId("100000000000000000000004"),
  maya: new mongoose.Types.ObjectId("100000000000000000000005")
} as const;

export type SeededMongoEvalSeedData = {
  users: Array<{
    _id: mongoose.Types.ObjectId;
    email: string;
    balance: number;
  }>;
  personalDetails: Array<{
    userId: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
  }>;
  transactions: Array<{
    ownerId: mongoose.Types.ObjectId;
    counterpartyEmail: string;
    amount: number;
    type: "credit" | "debit";
    directionLabel: string;
    reason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

function getSeededMongoUri() {
  return process.env.VIRLY_AI_EVAL_MONGO_URI?.trim() || "";
}

function isSeededMongoEvalEnabled() {
  return process.env.VIRLY_AI_EVAL_ENABLE_MONGO?.trim().toLowerCase() === "true";
}

export function buildSeededMongoEvalSeedData(): SeededMongoEvalSeedData {
  const now = new Date("2026-06-04T10:00:00.000Z");
  const oneHourAgo = new Date("2026-06-04T09:00:00.000Z");
  const yesterday = new Date("2026-06-03T08:00:00.000Z");
  const twoDaysAgo = new Date("2026-06-02T12:00:00.000Z");
  const threeDaysAgo = new Date("2026-06-01T14:00:00.000Z");

  return {
    users: [
      {
        _id: SEEDED_MONGO_USER_ID,
        email: "ai-eval-owner@example.com",
        balance: 1250
      },
      {
        _id: SEEDED_MONGO_COUNTERPARTY_IDS.alex,
        email: "alex@example.com",
        balance: 500
      },
      {
        _id: SEEDED_MONGO_COUNTERPARTY_IDS.daniel,
        email: "daniel@example.com",
        balance: 500
      },
      {
        _id: SEEDED_MONGO_COUNTERPARTY_IDS.sarah,
        email: "sarah@example.com",
        balance: 500
      },
      {
        _id: SEEDED_MONGO_COUNTERPARTY_IDS.maya,
        email: "maya@example.com",
        balance: 500
      }
    ],
    personalDetails: [
      {
        userId: SEEDED_MONGO_COUNTERPARTY_IDS.alex,
        firstName: "Alex",
        lastName: "Example"
      },
      {
        userId: SEEDED_MONGO_COUNTERPARTY_IDS.daniel,
        firstName: "Daniel",
        lastName: "Example"
      },
      {
        userId: SEEDED_MONGO_COUNTERPARTY_IDS.sarah,
        firstName: "Sarah",
        lastName: "Example"
      },
      {
        userId: SEEDED_MONGO_COUNTERPARTY_IDS.maya,
        firstName: "Maya",
        lastName: "Example"
      }
    ],
    transactions: [
      {
        ownerId: SEEDED_MONGO_USER_ID,
        counterpartyEmail: "sarah@example.com",
        amount: 30,
        type: "credit",
        directionLabel: "received",
        reason: "refund",
        createdAt: now,
        updatedAt: now
      },
      {
        ownerId: SEEDED_MONGO_USER_ID,
        counterpartyEmail: "daniel@example.com",
        amount: 50,
        type: "debit",
        directionLabel: "sent",
        reason: "dinner",
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo
      },
      {
        ownerId: SEEDED_MONGO_USER_ID,
        counterpartyEmail: "alex@example.com",
        amount: 20,
        type: "credit",
        directionLabel: "received",
        reason: "payback",
        createdAt: yesterday,
        updatedAt: yesterday
      },
      {
        ownerId: SEEDED_MONGO_USER_ID,
        counterpartyEmail: "daniel@example.com",
        amount: 20,
        type: "credit",
        directionLabel: "received",
        reason: "refund",
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo
      },
      {
        ownerId: SEEDED_MONGO_USER_ID,
        counterpartyEmail: "alex@example.com",
        amount: 15,
        type: "credit",
        directionLabel: "received",
        reason: "split",
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo
      }
    ]
  };
}

async function seedMongoEvalBaseData() {
  const seedData = buildSeededMongoEvalSeedData();

  await User.insertMany(
    seedData.users.map((user) => ({
      _id: user._id,
      email: user.email,
      passwordHash: "seeded-password-hash",
      phone: "0500000000",
      isVerified: true,
      balance: user.balance
    }))
  );
  await PersonalDetails.insertMany(
    seedData.personalDetails.map((detail) => ({
      userId: detail.userId,
      status: "provided",
      firstName: detail.firstName,
      lastName: detail.lastName
    }))
  );
  await Transaction.insertMany(seedData.transactions);

  return seedData;
}

async function seedScenarioConversationContext(scenario: AiEvalScenario) {
  const context = buildInitialConversationContext(scenario);

  await mongoConversationStore.save({
    userId: String(SEEDED_MONGO_USER_ID),
    conversationId: `eval-${scenario.id}`,
    assistantId: DEFAULT_ASSISTANT_ID,
    messages: context.messages,
    memory: context.memory
  });
}

function collectFailures(
  fixtureFile: AiEvalFixtureFile,
  scenario: AiEvalScenario,
  turn: AiEvalTurnExpectation,
  result: Awaited<ReturnType<typeof runAssistantGraph>>,
  turnIndex: number
) {
  const failures: string[] = [];
  const prefix = `${fixtureFile.suiteName}/${scenario.id} turn ${turnIndex}`;

  if (turn.expectedIntent && result.intent !== turn.expectedIntent) {
    failures.push(
      `${prefix} intent expected ${turn.expectedIntent} but got ${result.intent}`
    );
  }

  if (
    turn.expectedToolCalls &&
    JSON.stringify(result.toolCalls) !== JSON.stringify(turn.expectedToolCalls)
  ) {
    failures.push(
      `${prefix} tool calls expected ${JSON.stringify(turn.expectedToolCalls)} but got ${JSON.stringify(result.toolCalls)}`
    );
  }

  if (
    turn.expectedConfirmation?.recipientEmail &&
    result.confirmation?.recipientEmail !== turn.expectedConfirmation.recipientEmail
  ) {
    failures.push(
      `${prefix} confirmation recipient expected ${turn.expectedConfirmation.recipientEmail} but got ${result.confirmation?.recipientEmail ?? "undefined"}`
    );
  }

  if (
    typeof turn.expectedConfirmation?.amount === "number" &&
    result.confirmation?.amount !== turn.expectedConfirmation.amount
  ) {
    failures.push(
      `${prefix} confirmation amount expected ${turn.expectedConfirmation.amount} but got ${result.confirmation?.amount ?? "undefined"}`
    );
  }

  if (
    typeof turn.mustAskClarification === "boolean" &&
    Boolean(result.clarification) !== turn.mustAskClarification
  ) {
    failures.push(
      `${prefix} clarification presence expected ${turn.mustAskClarification} but got ${Boolean(result.clarification)}`
    );
  }

  for (const expectedText of turn.mustInclude ?? []) {
    if (
      !new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
        result.message
      )
    ) {
      failures.push(`${prefix} message must include ${expectedText}`);
    }
  }

  for (const forbiddenText of turn.mustNotInclude ?? []) {
    if (
      new RegExp(forbiddenText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(
        result.message
      )
    ) {
      failures.push(`${prefix} message must not include ${forbiddenText}`);
    }
  }

  return failures;
}

async function getSeededMongoToolsForScenario(
  _scenario: AiEvalScenario
): Promise<AssistantToolExecutors> {
  return readOnlyToolExecutors;
}

export async function runSeededMongoEvalFixtures(): Promise<AiEvalRunSummary> {
  if (!isSeededMongoEvalEnabled()) {
    throw new Error(
      "Seeded Mongo eval mode requires VIRLY_AI_EVAL_ENABLE_MONGO=true."
    );
  }

  const mongoUri = getSeededMongoUri();
  if (!mongoUri) {
    throw new Error(
      "Seeded Mongo eval mode requires VIRLY_AI_EVAL_MONGO_URI."
    );
  }

  const fixtures = loadAiEvalFixtureFiles();
  const failedTurns: AiEvalTurnResult[] = [];
  let totalScenarios = 0;
  let totalTurns = 0;

  await mongoose.connect(mongoUri);

  try {
    await mongoose.connection.dropDatabase();
    await seedMongoEvalBaseData();

    for (const fixtureFile of fixtures) {
      for (const scenario of fixtureFile.scenarios) {
        totalScenarios += 1;
        await seedScenarioConversationContext(scenario);
        const tools = await getSeededMongoToolsForScenario(scenario);

        for (const [turnIndex, turn] of scenario.turns.entries()) {
          totalTurns += 1;
          const result = await runAssistantGraph(
            {
              userId: String(SEEDED_MONGO_USER_ID),
              conversationId: `eval-${scenario.id}`,
              message: turn.userMessage
            },
            {
              tools,
              conversationStore: mongoConversationStore,
              transferPreparationService: createTransferPreparationService(),
              transferModificationService: createTransferModificationService()
            }
          );

          const failures = collectFailures(
            fixtureFile,
            scenario,
            turn,
            result,
            turnIndex
          );

          if (failures.length > 0) {
            failedTurns.push({
              fixtureSuiteName: fixtureFile.suiteName,
              scenarioId: scenario.id,
              turnIndex,
              userMessage: turn.userMessage,
              passed: false,
              failures
            });
          }
        }
      }
    }
  } finally {
    try {
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }

  return {
    mode: "seeded-mongo",
    totalFixtures: fixtures.length,
    totalScenarios,
    totalTurns,
    failedTurns
  };
}

export async function clearSeededMongoEvalCollections() {
  await Promise.all([
    AiConversation.deleteMany({}),
    AiPendingTransfer.deleteMany({}),
    PersonalDetails.deleteMany({}),
    Transaction.deleteMany({}),
    User.deleteMany({})
  ]);
}
