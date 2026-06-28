import type { AssistantLlmProvider } from "../state.js";
import { runAiEvalFixtures } from "../evals/runner.js";
import { loadAiEvalFixtureFiles } from "../evals/loadFixtures.js";
import { buildSeededMongoEvalSeedData } from "../evals/seededMongo.js";
import type { AiEvalFixtureFile } from "../evals/types.js";

test("phase 13 deterministic eval fixtures pass against graph", async () => {
  const summary = await runAiEvalFixtures({ mode: "deterministic" });
  expect(summary.totalFixtures).toBe(4);
  expect(summary.failedTurns.length).toBe(0);
});

test("phase 13 llm-dev eval mode fails clearly when no configured provider is available", async () => {
  const previous = process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  try {
    await expect(() => runAiEvalFixtures({ mode: "llm-dev" })).rejects.toThrow(
      /Configured LLM eval mode requires VIRLY_AI_EVAL_ENABLE_LLM_DEV=true|Configured LLM eval mode requires OPENAI_API_KEY and VIRLY_AI_MODEL/i
    );
  } finally {
    if (previous == null) {
      delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
    } else {
      process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = previous;
    }
  }
});

test("phase 13 llm-dev eval mode can run with an injected configured provider", async () => {
  const previous = process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = "true";

  const fixture: AiEvalFixtureFile = {
    suiteName: "llm-dev-test",
    scenarios: [{
      id: "balance-inquiry",
      description: "Minimal read-only llm-dev happy path",
      toolPreset: "default",
      turns: [{
        userMessage: "what is my balance?",
        expectedIntent: "balance_inquiry",
        expectedToolCalls: ["getUserAccounts", "getAccountBalance"]
      }]
    }]
  };

  const fakeConfiguredProvider: AssistantLlmProvider = {
    async classifyIntent() { return { intent: "balance_inquiry" }; },
    async extractTransferDraft() { return {}; },
    async resolveCounterpartyReference() { return { kind: "none", confidence: "low" }; },
    async composeResponse(input) { return input.fallbackMessage; }
  };

  try {
    const summary = await runAiEvalFixtures({ mode: "llm-dev", fixtures: [fixture], createConfiguredProvider: () => fakeConfiguredProvider });
    expect(summary.mode).toBe("llm-dev");
    expect(summary.totalFixtures).toBe(1);
    expect(summary.totalScenarios).toBe(1);
    expect(summary.totalTurns).toBe(1);
    expect(summary.failedTurns.length).toBe(0);
  } finally {
    if (previous == null) {
      delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
    } else {
      process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = previous;
    }
  }
});

test("phase 13 seeded-mongo eval mode fails closed without explicit dedicated db opt-in", async () => {
  const previousMongo = process.env.VIRLY_AI_EVAL_ENABLE_MONGO;
  const previousMongoUri = process.env.VIRLY_AI_EVAL_MONGO_URI;
  delete process.env.VIRLY_AI_EVAL_ENABLE_MONGO;
  delete process.env.VIRLY_AI_EVAL_MONGO_URI;
  try {
    await expect(() => runAiEvalFixtures({ mode: "seeded-mongo" })).rejects.toThrow(
      /Seeded Mongo eval mode requires VIRLY_AI_EVAL_ENABLE_MONGO=true|Seeded Mongo eval mode requires VIRLY_AI_EVAL_MONGO_URI/i
    );
  } finally {
    if (previousMongo == null) { delete process.env.VIRLY_AI_EVAL_ENABLE_MONGO; } else { process.env.VIRLY_AI_EVAL_ENABLE_MONGO = previousMongo; }
    if (previousMongoUri == null) { delete process.env.VIRLY_AI_EVAL_MONGO_URI; } else { process.env.VIRLY_AI_EVAL_MONGO_URI = previousMongoUri; }
  }
});

test("phase 13 llm-seeded-mongo eval mode requires live llm opt-in", async () => {
  const previous = process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  try {
    await expect(() => runAiEvalFixtures({ mode: "llm-seeded-mongo" })).rejects.toThrow(
      /Configured LLM eval mode requires VIRLY_AI_EVAL_ENABLE_LLM_DEV=true/i
    );
  } finally {
    if (previous == null) { delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV; } else { process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = previous; }
  }
});

test("phase 13 llm-seeded-mongo eval mode requires seeded mongo opt-in after live llm setup", async () => {
  const previousLlm = process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV;
  const previousMongo = process.env.VIRLY_AI_EVAL_ENABLE_MONGO;
  const previousMongoUri = process.env.VIRLY_AI_EVAL_MONGO_URI;
  process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = "true";
  delete process.env.VIRLY_AI_EVAL_ENABLE_MONGO;
  delete process.env.VIRLY_AI_EVAL_MONGO_URI;

  const fakeConfiguredProvider: AssistantLlmProvider = {
    async classifyIntent() { return { intent: "balance_inquiry" }; },
    async extractTransferDraft() { return {}; },
    async resolveCounterpartyReference() { return { kind: "none", confidence: "low" }; },
    async composeResponse(input) { return input.fallbackMessage; }
  };

  try {
    await expect(() => runAiEvalFixtures({ mode: "llm-seeded-mongo", createConfiguredProvider: () => fakeConfiguredProvider })).rejects.toThrow(
      /Seeded Mongo eval mode requires VIRLY_AI_EVAL_ENABLE_MONGO=true/i
    );
  } finally {
    if (previousLlm == null) { delete process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV; } else { process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV = previousLlm; }
    if (previousMongo == null) { delete process.env.VIRLY_AI_EVAL_ENABLE_MONGO; } else { process.env.VIRLY_AI_EVAL_ENABLE_MONGO = previousMongo; }
    if (previousMongoUri == null) { delete process.env.VIRLY_AI_EVAL_MONGO_URI; } else { process.env.VIRLY_AI_EVAL_MONGO_URI = previousMongoUri; }
  }
});

test("phase 13 seeded-mongo seed data matches current fixture expectations", () => {
  const seedData = buildSeededMongoEvalSeedData();
  const transactionsByCounterparty = new Map<string, typeof seedData.transactions>();
  for (const transaction of seedData.transactions) {
    const current = transactionsByCounterparty.get(transaction.counterpartyEmail) ?? [];
    current.push(transaction);
    transactionsByCounterparty.set(transaction.counterpartyEmail, current);
  }

  expect(seedData.users.some((user) => user.email === "ai-eval-owner@example.com")).toBe(true);
  expect(seedData.personalDetails.some((detail) => detail.firstName === "Daniel")).toBe(true);

  const alexTotalReceived = (transactionsByCounterparty.get("alex@example.com") ?? [])
    .filter((t) => t.type === "credit")
    .reduce((total, t) => total + t.amount, 0);
  expect(alexTotalReceived).toBe(35);

  const danielTotalReceived = (transactionsByCounterparty.get("daniel@example.com") ?? [])
    .filter((t) => t.type === "credit")
    .reduce((total, t) => total + t.amount, 0);
  expect(danielTotalReceived).toBe(35);

  const raniTransactions = transactionsByCounterparty.get("rani@example.com") ?? [];
  expect(raniTransactions.some((t) => t.type === "debit" && t.amount === 42)).toBe(true);
  expect(raniTransactions.some((t) => t.type === "credit")).toBe(true);

  const sarahTransactions = transactionsByCounterparty.get("sarah@example.com") ?? [];
  expect(sarahTransactions.some((t) => t.type === "credit" && t.amount === 30)).toBe(true);
  expect(sarahTransactions.some((t) => t.type === "debit" && t.amount === 25)).toBe(true);

  const alexTransactions = transactionsByCounterparty.get("alex@example.com") ?? [];
  expect(alexTransactions.some((t) => t.type === "debit" && t.amount === 12)).toBe(true);

  const danielTransactions = transactionsByCounterparty.get("daniel@example.com") ?? [];
  expect(danielTransactions.some((t) => t.type === "debit" && t.amount === 25)).toBe(true);

  const pendingFixture = loadAiEvalFixtureFiles().find((f) => f.suiteName === "pending-confirmations");
  const multiPendingScenario = pendingFixture?.scenarios.find((s) => s.id === "hebrew-pending-list-current-conversation");
  expect(multiPendingScenario?.setup?.pendingTransfers?.length).toBe(2);
  expect(multiPendingScenario?.setup?.pendingTransfers?.map((pt) => pt.amount)).toStrictEqual([50, 90]);
});
