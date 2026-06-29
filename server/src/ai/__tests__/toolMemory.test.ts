import { applyToolMemoryUpdates } from "../toolMemory.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";
import type { CounterpartyMemory } from "../state.js";

function emptyMemory(): CounterpartyMemory {
  return createEmptyCounterpartyMemory();
}

describe("applyToolMemoryUpdates", () => {
  describe("no-op when updates is undefined", () => {
    test("returns the same memory object reference when updates is undefined", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(memory, undefined, 1);
      expect(result).toBe(memory);
    });
  });

  describe("counterparties", () => {
    test("adds a counterparty entity to entities list", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          counterparties: [
            {
              counterpartyId: "cp1",
              emailFullForBackendOnly: "alice@example.com",
              emailMasked: "a***@example.com",
              displayName: "Alice",
              relation: "sent_to",
              source: "transaction"
            }
          ]
        },
        1
      );
      const entities = result.entities ?? [];
      const cpEntity = entities.find((e) => e.id === "counterparty:cp1");
      expect(cpEntity).toBeDefined();
      expect(cpEntity!.type).toBe("counterparty");
      expect(cpEntity!.email).toBe("alice@example.com");
      expect(cpEntity!.turnIntroduced).toBe(1);
    });

    test("entity aliases include masked label", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          counterparties: [
            {
              counterpartyId: "cp2",
              emailFullForBackendOnly: "bob@example.com",
              emailMasked: "b***@example.com",
              displayName: "Bob Smith",
              relation: "received_from",
              source: "verified_recipient"
            }
          ]
        },
        2
      );
      const entity = (result.entities ?? []).find((e) => e.id === "counterparty:cp2");
      expect(entity).toBeDefined();
      expect(entity!.aliases.length).toBeGreaterThan(0);
      expect(entity!.aliases).toContain("b***@example.com");
    });

    test("also updates mentionedCounterparties via rememberCounterparty", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          counterparties: [
            {
              counterpartyId: "cp3",
              emailFullForBackendOnly: "charlie@example.com",
              emailMasked: "c***@example.com",
              displayName: "Charlie",
              relation: "both",
              source: "profile"
            }
          ]
        },
        3
      );
      expect(
        result.mentionedCounterparties.some((c) => c.email === "charlie@example.com")
      ).toBe(true);
    });
  });

  describe("transactions", () => {
    test("adds a transaction entity", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          transactions: [
            {
              transactionId: "tx-001",
              label: "Payment to Alice",
              amount: 250,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2024-01-15T10:00:00Z"
            }
          ]
        },
        4
      );
      const entity = (result.entities ?? []).find((e) => e.id === "transaction:tx-001");
      expect(entity).toBeDefined();
      expect(entity!.type).toBe("transaction");
      expect(entity!.amount).toBe(250);
      expect(entity!.currency).toBe("ILS");
      expect(entity!.displayName).toBe("Payment to Alice");
    });

    test("entity aliases include the transaction label", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          transactions: [
            {
              transactionId: "tx-002",
              label: "Grocery payment",
              amount: 50,
              currency: "ILS",
              direction: "received",
              occurredAt: "2024-01-16T08:00:00Z"
            }
          ]
        },
        5
      );
      const entity = (result.entities ?? []).find((e) => e.id === "transaction:tx-002");
      expect(entity!.aliases).toContain("Grocery payment");
    });
  });

  describe("pendingTransfers", () => {
    test("adds a pending_transfer entity", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          pendingTransfers: [
            {
              pendingTransferId: "pt-001",
              label: "Transfer to Bob",
              recipientLabel: "Bob Smith",
              amount: 300,
              currency: "ILS",
              expiresAt: "2024-01-20T00:00:00Z"
            }
          ]
        },
        6
      );
      const entity = (result.entities ?? []).find((e) => e.id === "pending_transfer:pt-001");
      expect(entity).toBeDefined();
      expect(entity!.type).toBe("pending_transfer");
      expect(entity!.amount).toBe(300);
      expect(entity!.expiresAt).toBe("2024-01-20T00:00:00Z");
    });

    test("entity aliases include both label and recipientLabel", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          pendingTransfers: [
            {
              pendingTransferId: "pt-002",
              label: "Pending transfer",
              recipientLabel: "Carol",
              amount: 100,
              currency: "ILS",
              expiresAt: "2024-01-21T00:00:00Z"
            }
          ]
        },
        7
      );
      const entity = (result.entities ?? []).find((e) => e.id === "pending_transfer:pt-002");
      expect(entity!.aliases).toContain("Pending transfer");
      expect(entity!.aliases).toContain("Carol");
    });
  });

  describe("dateRanges", () => {
    test("adds a date_range entity", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          dateRanges: [
            {
              label: "Last month",
              from: "2024-01-01",
              to: "2024-01-31"
            }
          ]
        },
        8
      );
      const entity = (result.entities ?? []).find(
        (e) => e.id === "date_range:2024-01-01:2024-01-31"
      );
      expect(entity).toBeDefined();
      expect(entity!.type).toBe("date_range");
      expect(entity!.dateRange?.from).toBe("2024-01-01");
      expect(entity!.dateRange?.to).toBe("2024-01-31");
      expect(entity!.displayName).toBe("Last month");
    });

    test("entity aliases include the label", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          dateRanges: [
            {
              label: "This week",
              from: "2024-02-05",
              to: "2024-02-11"
            }
          ]
        },
        9
      );
      const entity = (result.entities ?? []).find((e) => e.type === "date_range");
      expect(entity!.aliases).toContain("This week");
    });
  });

  describe("totals", () => {
    test("adds a total entity", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          totals: [
            {
              id: "sent:alice@example.com",
              counterpartyEmail: "alice@example.com",
              direction: "sent",
              amount: 1500,
              currency: "ILS",
              sourceToolName: "getTotalSentToCounterparty",
              aliases: ["Total sent to Alice", "Alice sent total"]
            }
          ]
        },
        10
      );
      const entity = (result.entities ?? []).find((e) => e.id === "total:sent:alice@example.com");
      expect(entity).toBeDefined();
      expect(entity!.type).toBe("total");
      expect(entity!.amount).toBe(1500);
      expect(entity!.currency).toBe("ILS");
      expect(entity!.direction).toBe("sent");
      expect(entity!.counterpartyEmail).toBe("alice@example.com");
    });

    test("entity displayName is first alias", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          totals: [
            {
              id: "net:bob@example.com",
              direction: "net",
              amount: 200,
              currency: "ILS",
              sourceToolName: "getNetWithCounterparty",
              aliases: ["Net with Bob", "Bob net balance"]
            }
          ]
        },
        11
      );
      const entity = (result.entities ?? []).find((e) => e.id === "total:net:bob@example.com");
      expect(entity!.displayName).toBe("Net with Bob");
    });

    test("entity displayName falls back to direction label when aliases is empty", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          totals: [
            {
              id: "received:cp5",
              direction: "received",
              amount: 50,
              currency: "ILS",
              sourceToolName: "getTotalReceivedFromCounterparty",
              aliases: []
            }
          ]
        },
        12
      );
      const entity = (result.entities ?? []).find((e) => e.id === "total:received:cp5");
      expect(entity!.displayName).toBe("received total");
    });
  });

  describe("entity cap", () => {
    test("caps total entities at 20 (MAX_CONTEXT_ENTITIES)", () => {
      let memory = emptyMemory();
      // Fill with 19 pre-existing transactions
      memory = {
        ...memory,
        entities: Array.from({ length: 19 }, (_, i) => ({
          id: `transaction:pre-${i}`,
          type: "transaction" as const,
          turnIntroduced: 1,
          turnLastReferenced: 1,
          source: "tool_result" as const,
          confidence: "high" as const,
          displayName: `pre-${i}`,
          aliases: [`pre-${i}`]
        }))
      };
      // Add 3 more transactions
      const result = applyToolMemoryUpdates(
        memory,
        {
          transactions: [
            { transactionId: "new-1", label: "New 1", amount: 10, currency: "ILS", direction: "sent", occurredAt: "2024-01-01T00:00:00Z" },
            { transactionId: "new-2", label: "New 2", amount: 20, currency: "ILS", direction: "received", occurredAt: "2024-01-02T00:00:00Z" },
            { transactionId: "new-3", label: "New 3", amount: 30, currency: "ILS", direction: "sent", occurredAt: "2024-01-03T00:00:00Z" }
          ]
        },
        13
      );
      expect((result.entities ?? []).length).toBeLessThanOrEqual(20);
    });
  });

  describe("deduplication", () => {
    test("replaces an existing entity with the same id", () => {
      const memory = emptyMemory();
      const firstResult = applyToolMemoryUpdates(
        memory,
        {
          transactions: [
            {
              transactionId: "tx-dup",
              label: "Original",
              amount: 100,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2024-01-01T00:00:00Z"
            }
          ]
        },
        1
      );
      const secondResult = applyToolMemoryUpdates(
        firstResult,
        {
          transactions: [
            {
              transactionId: "tx-dup",
              label: "Updated",
              amount: 150,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2024-01-01T00:00:00Z"
            }
          ]
        },
        2
      );
      const dups = (secondResult.entities ?? []).filter((e) => e.id === "transaction:tx-dup");
      expect(dups).toHaveLength(1);
      expect(dups[0].displayName).toBe("Updated");
      expect(dups[0].amount).toBe(150);
    });
  });

  describe("multiple update types in one call", () => {
    test("can process counterparties, transactions, and dateRanges together", () => {
      const memory = emptyMemory();
      const result = applyToolMemoryUpdates(
        memory,
        {
          counterparties: [
            {
              counterpartyId: "cp-multi",
              emailFullForBackendOnly: "multi@example.com",
              emailMasked: "m***@example.com",
              displayName: "Multi User",
              relation: "sent_to",
              source: "transaction"
            }
          ],
          transactions: [
            {
              transactionId: "tx-multi",
              label: "Multi tx",
              amount: 50,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2024-01-01T00:00:00Z"
            }
          ],
          dateRanges: [
            { label: "Today", from: "2024-01-01", to: "2024-01-01" }
          ]
        },
        5
      );
      const entities = result.entities ?? [];
      expect(entities.some((e) => e.id === "counterparty:cp-multi")).toBe(true);
      expect(entities.some((e) => e.id === "transaction:tx-multi")).toBe(true);
      expect(entities.some((e) => e.type === "date_range")).toBe(true);
    });
  });
});
