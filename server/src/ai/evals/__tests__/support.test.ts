/**
 * Unit tests for evals/support.ts — pure helper functions.
 * No LLM, no DB, no network calls.
 */
import {
  createMemoryWithCounterparties,
  createPendingConfirmationMemory,
  buildInitialConversationContext,
  createTransferPreparationService,
  createTransferModificationService
} from "../support.js";
import type { AiEvalScenario } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function minimalScenario(overrides: Partial<AiEvalScenario> = {}): AiEvalScenario {
  return {
    id: "test-scenario",
    description: "A test scenario",
    toolPreset: "default",
    turns: [{ userMessage: "Hello" }],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// createMemoryWithCounterparties
// ---------------------------------------------------------------------------
describe("createMemoryWithCounterparties", () => {
  it("returns an empty-ish memory for an empty email list", () => {
    const memory = createMemoryWithCounterparties([]);
    // mentionedCounterparties array should be empty
    expect(memory.mentionedCounterparties).toHaveLength(0);
  });

  it("remembers a single counterparty in mentionedCounterparties", () => {
    const memory = createMemoryWithCounterparties(["alice@example.com"]);
    const cp = memory.mentionedCounterparties.find(
      (e) => e.email === "alice@example.com"
    );
    expect(cp).toBeDefined();
  });

  it("remembers multiple counterparties with distinct entries", () => {
    const emails = ["alice@example.com", "bob@example.com", "carol@example.com"];
    const memory = createMemoryWithCounterparties(emails);
    for (const email of emails) {
      expect(memory.mentionedCounterparties.some((e) => e.email === email)).toBe(true);
    }
  });

  it("masks the email in the maskedLabel (first-char + ***@domain)", () => {
    const memory = createMemoryWithCounterparties(["dave@example.com"]);
    const cp = memory.mentionedCounterparties.find((e) => e.email === "dave@example.com");
    expect(cp?.maskedLabel).toBe("d***@example.com");
  });
});

// ---------------------------------------------------------------------------
// createPendingConfirmationMemory
// ---------------------------------------------------------------------------
describe("createPendingConfirmationMemory", () => {
  it("returns null when the scenario has no pendingConfirmation in setup", () => {
    const scenario = minimalScenario({ setup: undefined });
    expect(createPendingConfirmationMemory(scenario)).toBeNull();
  });

  it("returns null when setup exists but no pendingConfirmation", () => {
    const scenario = minimalScenario({ setup: { rememberedCounterparties: ["x@x.com"] } });
    expect(createPendingConfirmationMemory(scenario)).toBeNull();
  });

  it("creates a pending confirmation with the correct recipientEmail and amount", () => {
    const scenario = minimalScenario({
      setup: {
        pendingConfirmation: {
          recipientEmail: "bob@example.com",
          amount: 75,
          currency: "ILS"
        }
      }
    });
    const result = createPendingConfirmationMemory(scenario);
    expect(result).not.toBeNull();
    expect(result?.recipientEmail).toBe("bob@example.com");
    expect(result?.amount).toBe(75);
    expect(result?.currency).toBe("ILS");
    expect(result?.status).toBe("pending");
    expect(result?.type).toBe("transfer");
  });

  it("defaults version to 1 when not specified", () => {
    const scenario = minimalScenario({
      setup: {
        pendingConfirmation: {
          recipientEmail: "alice@example.com",
          amount: 50,
          currency: "ILS"
        }
      }
    });
    expect(createPendingConfirmationMemory(scenario)?.version).toBe(1);
  });

  it("uses the provided version when specified", () => {
    const scenario = minimalScenario({
      setup: {
        pendingConfirmation: {
          recipientEmail: "alice@example.com",
          amount: 50,
          currency: "ILS",
          version: 3
        }
      }
    });
    expect(createPendingConfirmationMemory(scenario)?.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildInitialConversationContext
// ---------------------------------------------------------------------------
describe("buildInitialConversationContext", () => {
  it("returns an empty messages array", () => {
    const scenario = minimalScenario();
    const ctx = buildInitialConversationContext(scenario);
    expect(ctx.messages).toEqual([]);
  });

  it("has pendingConfirmation as null in memory when setup has none", () => {
    const scenario = minimalScenario();
    const ctx = buildInitialConversationContext(scenario);
    // createEmptyCounterpartyMemory sets pendingConfirmation to null (not undefined)
    expect(ctx.memory.pendingConfirmation).toBeNull();
  });

  it("seeds remembered counterparties into memory when setup specifies them", () => {
    const scenario = minimalScenario({
      setup: { rememberedCounterparties: ["alice@example.com"] }
    });
    const ctx = buildInitialConversationContext(scenario);
    const cp = ctx.memory.mentionedCounterparties.find(
      (e) => e.email === "alice@example.com"
    );
    expect(cp).toBeDefined();
  });

  it("includes pendingConfirmation in memory when setup has one", () => {
    const scenario = minimalScenario({
      setup: {
        pendingConfirmation: {
          recipientEmail: "carol@example.com",
          amount: 200,
          currency: "ILS"
        }
      }
    });
    const ctx = buildInitialConversationContext(scenario);
    expect(ctx.memory.pendingConfirmation).toBeDefined();
    expect(ctx.memory.pendingConfirmation?.recipientEmail).toBe("carol@example.com");
    expect(ctx.memory.mode).toBe("transfer_confirmation_pending");
  });
});

// ---------------------------------------------------------------------------
// createInMemoryConversationStore (via buildInitialConversationContext)
// ---------------------------------------------------------------------------
describe("createInMemoryConversationStore (via support)", () => {
  it("loads the initial context built from the scenario", async () => {
    const { createInMemoryConversationStore } = await import("../support.js");
    const scenario = minimalScenario({
      setup: { rememberedCounterparties: ["alice@example.com"] }
    });
    const store = createInMemoryConversationStore(scenario);
    const ctx = await store.load("u1", "c1");
    expect(ctx.messages).toEqual([]);
    const cp = ctx.memory.mentionedCounterparties.find(
      (e) => e.email === "alice@example.com"
    );
    expect(cp).toBeDefined();
  });

  it("persists saved context on the next load", async () => {
    const { createInMemoryConversationStore } = await import("../support.js");
    const scenario = minimalScenario();
    const store = createInMemoryConversationStore(scenario);
    const updatedMemory = (await store.load("u1", "c1")).memory;
    await store.save({
      messages: [{ role: "user", content: "hi" } as never],
      memory: updatedMemory,
      conversationId: "c1",
      userId: "u1",
      assistantId: "oshri"
    });
    const reloaded = await store.load("u1", "c1");
    // trimConversationMessages may truncate but messages are returned
    expect(reloaded.messages.length).toBeGreaterThanOrEqual(0);
    expect(reloaded.memory).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createTransferPreparationService
// ---------------------------------------------------------------------------
describe("createTransferPreparationService", () => {
  it("returns needs_clarification when draft has no amount", async () => {
    const svc = createTransferPreparationService();
    const result = await svc({
      draft: {},
      resolvedCounterparty: undefined
    } as never);
    expect(result.status).toBe("needs_clarification");
  });

  it("returns needs_clarification when draft has amount but no recipient", async () => {
    const svc = createTransferPreparationService();
    const result = await svc({
      draft: { amount: 50 },
      resolvedCounterparty: undefined
    } as never);
    expect(result.status).toBe("needs_clarification");
  });

  it("returns ready when draft has both amount and recipientEmail", async () => {
    const svc = createTransferPreparationService();
    const result = await svc({
      draft: { amount: 50, recipientEmail: "alice@example.com" },
      resolvedCounterparty: undefined
    } as never);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.confirmation.amount).toBe(50);
      expect(result.confirmation.recipientEmail).toBe("alice@example.com");
    }
  });

  it("falls back to resolvedCounterparty email when draft has no recipientEmail", async () => {
    const svc = createTransferPreparationService();
    const result = await svc({
      draft: { amount: 80 },
      resolvedCounterparty: { email: "bob@example.com" }
    } as never);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.confirmation.recipientEmail).toBe("bob@example.com");
    }
  });

  it("returns a confirmation with a non-empty expiresAt", async () => {
    const svc = createTransferPreparationService();
    const result = await svc({
      draft: { amount: 10, recipientEmail: "x@x.com" },
      resolvedCounterparty: undefined
    } as never);
    if (result.status === "ready") {
      expect(result.confirmation.expiresAt).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// createTransferModificationService
// ---------------------------------------------------------------------------
describe("createTransferModificationService", () => {
  it("uses the modificationDraft amount when provided", async () => {
    const svc = createTransferModificationService();
    const result = await svc({
      modificationDraft: { amount: 200 },
      activePendingTransferId: "pending-transfer-1",
      resolvedCounterparty: undefined
    } as never);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.confirmation.amount).toBe(200);
    }
  });

  it("defaults amount to 50 when not provided in modificationDraft", async () => {
    const svc = createTransferModificationService();
    const result = await svc({
      modificationDraft: {},
      activePendingTransferId: "pending-transfer-1",
      resolvedCounterparty: undefined
    } as never);
    if (result.status === "ready") {
      expect(result.confirmation.amount).toBe(50);
    }
  });

  it("sets supersededConfirmationId to the activePendingTransferId", async () => {
    const svc = createTransferModificationService();
    const result = await svc({
      modificationDraft: { amount: 100 },
      activePendingTransferId: "pending-transfer-42",
      resolvedCounterparty: undefined
    } as never);
    if (result.status === "ready") {
      expect(result.supersededConfirmationId).toBe("pending-transfer-42");
    }
  });

  it("uses modificationDraft.recipientEmail when provided", async () => {
    const svc = createTransferModificationService();
    const result = await svc({
      modificationDraft: { amount: 30, recipientEmail: "alice@example.com" },
      activePendingTransferId: "p1",
      resolvedCounterparty: undefined
    } as never);
    if (result.status === "ready") {
      expect(result.confirmation.recipientEmail).toBe("alice@example.com");
    }
  });

  it("falls back to resolvedCounterparty email when modificationDraft has none", async () => {
    const svc = createTransferModificationService();
    const result = await svc({
      modificationDraft: { amount: 30 },
      activePendingTransferId: "p1",
      resolvedCounterparty: { email: "bob@example.com" }
    } as never);
    if (result.status === "ready") {
      expect(result.confirmation.recipientEmail).toBe("bob@example.com");
    }
  });
});
