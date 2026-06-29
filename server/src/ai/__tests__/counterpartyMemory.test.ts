import {
  buildCounterpartyUserLabel,
  counterpartyAliases,
  createEmptyCounterpartyMemory,
  createEmptyTransferIntentFrame,
  maskEmail,
  normalizeCounterpartyMemory,
  normalizeTransferIntentFrame,
  rememberCounterparty,
  resolveCounterpartyReferenceDeterministic,
  resolveReferenceAgainstMemory,
  trimConversationMessages
} from "../counterpartyMemory.js";
import type { CounterpartyMemory, CounterpartyRef } from "../state.js";

function ref(overrides: Partial<CounterpartyRef> = {}): CounterpartyRef {
  return {
    email: "bob@example.com",
    maskedLabel: "b***@example.com",
    userLabel: "bob@example.com",
    aliases: ["bob@example.com"],
    firstMentionedAtTurn: 1,
    lastReferencedAtTurn: 1,
    ...overrides
  } as CounterpartyRef;
}

describe("maskEmail", () => {
  test("keeps the first character and masks the rest of the local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
  });
  test("falls back for a malformed email", () => {
    expect(maskEmail("not-an-email")).toBe("masked recipient");
  });
});

describe("buildCounterpartyUserLabel", () => {
  test("returns just the email when no distinct display name", () => {
    expect(buildCounterpartyUserLabel({ email: "Bob@Example.com" })).toBe(
      "bob@example.com"
    );
  });
  test("combines a distinct display name with the email", () => {
    expect(
      buildCounterpartyUserLabel({ email: "bob@example.com", displayName: "Bob R" })
    ).toBe("Bob R (bob@example.com)");
  });
});

describe("counterpartyAliases", () => {
  test("includes email, local part, masked label, and display-name tokens (deduped)", () => {
    const aliases = counterpartyAliases({
      email: "Bob.Roberts@Example.com",
      maskedLabel: "B***@example.com",
      displayName: "Bob Roberts"
    });
    expect(aliases).toContain("bob.roberts@example.com");
    expect(aliases).toContain("bob.roberts"); // local part
    expect(aliases).toContain("bob");
    expect(aliases).toContain("roberts");
    // No duplicate entries.
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("normalizeTransferIntentFrame", () => {
  test("returns an idle frame for missing or invalid input", () => {
    expect(normalizeTransferIntentFrame()).toStrictEqual(
      createEmptyTransferIntentFrame()
    );
    expect(
      normalizeTransferIntentFrame({ status: "bogus" as never }).status
    ).toBe("idle");
  });
  test("preserves a valid frame and defaults lastUpdatedTurn", () => {
    const frame = normalizeTransferIntentFrame({ status: "building" });
    expect(frame.status).toBe("building");
    expect(frame.lastUpdatedTurn).toBe(0);
  });
});

describe("normalizeCounterpartyMemory", () => {
  test("fills defaults for an empty/absent memory", () => {
    const memory = normalizeCounterpartyMemory(null);
    expect(memory.turn).toBe(0);
    expect(memory.mentionedCounterparties).toStrictEqual([]);
    expect(memory.mode).toBe("idle");
    expect(memory.transferIntentFrame?.status).toBe("idle");
  });
  test("caps mentioned counterparties at the maximum", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      ref({ email: `u${i}@x.com` })
    );
    const memory = normalizeCounterpartyMemory({ mentionedCounterparties: many });
    expect(memory.mentionedCounterparties.length).toBeLessThanOrEqual(8);
  });
});

describe("trimConversationMessages", () => {
  test("keeps only the most recent messages", () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({ id: i })) as never[];
    expect(trimConversationMessages(messages)).toHaveLength(20);
  });
});

describe("rememberCounterparty", () => {
  test("adds a new counterparty and sets it as lastCounterparty", () => {
    const memory = createEmptyCounterpartyMemory();
    const next = rememberCounterparty(memory, ref(), 1);
    expect(next.mentionedCounterparties).toHaveLength(1);
    expect(next.lastCounterparty?.email).toBe("bob@example.com");
    expect(next.turn).toBe(1);
  });

  test("updates an existing counterparty in place without duplicating", () => {
    let memory = createEmptyCounterpartyMemory();
    memory = rememberCounterparty(memory, ref(), 1);
    memory = rememberCounterparty(memory, ref({ lastReferencedAtTurn: 2 }), 2);
    expect(memory.mentionedCounterparties).toHaveLength(1);
    expect(memory.mentionedCounterparties[0]?.firstMentionedAtTurn).toBe(1);
    expect(memory.mentionedCounterparties[0]?.lastReferencedAtTurn).toBe(2);
  });
});

describe("resolveReferenceAgainstMemory", () => {
  const memory: CounterpartyMemory = {
    ...createEmptyCounterpartyMemory(),
    lastCounterparty: ref({ email: "last@x.com" }),
    mentionedCounterparties: [
      ref({ email: "first@x.com", firstMentionedAtTurn: 1 }),
      ref({ email: "second@x.com", firstMentionedAtTurn: 2 })
    ]
  };

  test("ignores low-confidence resolutions", () => {
    expect(
      resolveReferenceAgainstMemory(memory, {
        kind: "last_counterparty",
        confidence: "low"
      } as never)
    ).toBeUndefined();
  });

  test("resolves last_counterparty", () => {
    expect(
      resolveReferenceAgainstMemory(memory, {
        kind: "last_counterparty",
        confidence: "high"
      } as never)?.email
    ).toBe("last@x.com");
  });

  test("resolves an ordinal against first-mention order", () => {
    expect(
      resolveReferenceAgainstMemory(memory, {
        kind: "ordinal_counterparty",
        ordinal: 2,
        confidence: "high"
      } as never)?.email
    ).toBe("second@x.com");
  });

  test("resolves a named counterparty by email prefix", () => {
    expect(
      resolveReferenceAgainstMemory(memory, {
        kind: "named_counterparty",
        query: "first@x.com",
        confidence: "high"
      } as never)?.email
    ).toBe("first@x.com");
  });
});

describe("resolveCounterpartyReferenceDeterministic", () => {
  const memory: CounterpartyMemory = {
    ...createEmptyCounterpartyMemory(),
    lastCounterparty: ref({ email: "last@x.com" })
  };

  test("a pronoun resolves to the last counterparty", () => {
    expect(
      resolveCounterpartyReferenceDeterministic("send him 50", memory)?.email
    ).toBe("last@x.com");
  });

  test("unrelated text resolves to nothing", () => {
    expect(
      resolveCounterpartyReferenceDeterministic("what is my balance", memory)
    ).toBeUndefined();
  });
});
