/**
 * Unit tests for v2/world.ts — pure helper functions only.
 * No LLM, no DB, no network calls.
 */
import {
  WORLD,
  WORLD_RECENT_TX,
  cpOf,
  maskWorldEmail,
  fullName,
  worldCounterpartyEmails,
  findCounterpartyByEmail,
  findCounterpartyByQuery,
  ordinalFromMessage,
  totalsMemoryUpdate
} from "../world.js";

// ---------------------------------------------------------------------------
// cpOf
// ---------------------------------------------------------------------------
describe("cpOf", () => {
  it("returns the rani counterparty for key 'rani'", () => {
    const cp = cpOf("rani");
    expect(cp.key).toBe("rani");
    expect(cp.email).toBe("rani@example.com");
    expect(cp.totalSent).toBe(320);
    expect(cp.totalReceived).toBe(80);
  });

  it("returns the dan counterparty for key 'dan'", () => {
    const cp = cpOf("dan");
    expect(cp.key).toBe("dan");
    expect(cp.email).toBe("dan@example.com");
    expect(cp.totalSent).toBe(150);
    expect(cp.totalReceived).toBe(200);
  });

  it("returns the noa counterparty for key 'noa'", () => {
    const cp = cpOf("noa");
    expect(cp.key).toBe("noa");
    expect(cp.email).toBe("noa@example.com");
    expect(cp.totalSent).toBe(75);
    expect(cp.totalReceived).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// maskWorldEmail
// ---------------------------------------------------------------------------
describe("maskWorldEmail", () => {
  it("masks rani@example.com to r***@example.com", () => {
    expect(maskWorldEmail("rani@example.com")).toBe("r***@example.com");
  });

  it("masks dan@example.com to d***@example.com", () => {
    expect(maskWorldEmail("dan@example.com")).toBe("d***@example.com");
  });

  it("always produces @example.com suffix regardless of the original domain", () => {
    // maskWorldEmail unconditionally appends @example.com
    expect(maskWorldEmail("a@x.com")).toBe("a***@example.com");
  });
});

// ---------------------------------------------------------------------------
// fullName
// ---------------------------------------------------------------------------
describe("fullName", () => {
  it("combines firstName and lastName with a space", () => {
    expect(fullName(cpOf("rani"))).toBe("Rani Cohen");
  });

  it("produces the correct name for dan", () => {
    expect(fullName(cpOf("dan"))).toBe("Dan Levi");
  });

  it("produces the correct name for noa", () => {
    expect(fullName(cpOf("noa"))).toBe("Noa Bar");
  });
});

// ---------------------------------------------------------------------------
// worldCounterpartyEmails
// ---------------------------------------------------------------------------
describe("worldCounterpartyEmails", () => {
  it("returns an array of three emails", () => {
    const emails = worldCounterpartyEmails();
    expect(emails).toHaveLength(3);
  });

  it("includes all world counterparty emails", () => {
    const emails = worldCounterpartyEmails();
    expect(emails).toContain("rani@example.com");
    expect(emails).toContain("dan@example.com");
    expect(emails).toContain("noa@example.com");
  });
});

// ---------------------------------------------------------------------------
// findCounterpartyByEmail
// ---------------------------------------------------------------------------
describe("findCounterpartyByEmail", () => {
  it("finds rani by exact email", () => {
    const cp = findCounterpartyByEmail("rani@example.com");
    expect(cp?.key).toBe("rani");
  });

  it("finds dan by exact email", () => {
    const cp = findCounterpartyByEmail("dan@example.com");
    expect(cp?.key).toBe("dan");
  });

  it("returns undefined for an unknown email", () => {
    expect(findCounterpartyByEmail("unknown@example.com")).toBeUndefined();
  });

  it("returns undefined when email is undefined", () => {
    expect(findCounterpartyByEmail(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(findCounterpartyByEmail("")).toBeUndefined();
  });

  it("is case-insensitive (upper-case input is lowercased before lookup)", () => {
    // findCounterpartyByEmail lowercases the query before comparing
    expect(findCounterpartyByEmail("RANI@example.com")?.key).toBe("rani");
  });
});

// ---------------------------------------------------------------------------
// findCounterpartyByQuery
// ---------------------------------------------------------------------------
describe("findCounterpartyByQuery", () => {
  it("finds counterparty when query contains the full email", () => {
    const cp = findCounterpartyByQuery("please send to rani@example.com");
    expect(cp?.key).toBe("rani");
  });

  it("finds counterparty when query contains the first name (case-insensitive)", () => {
    const cp = findCounterpartyByQuery("send to Rani please");
    expect(cp?.key).toBe("rani");
  });

  it("finds counterparty when query contains the key", () => {
    const cp = findCounterpartyByQuery("transfer to dan");
    expect(cp?.key).toBe("dan");
  });

  it("returns undefined when no counterparty matches", () => {
    expect(findCounterpartyByQuery("send to sarah")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(findCounterpartyByQuery("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ordinalFromMessage
// ---------------------------------------------------------------------------
describe("ordinalFromMessage", () => {
  it("returns 1 for 'first'", () => {
    expect(ordinalFromMessage("show me the first one")).toBe(1);
  });

  it("returns 1 for '1st'", () => {
    expect(ordinalFromMessage("the 1st transaction")).toBe(1);
  });

  it("returns 2 for 'second'", () => {
    expect(ordinalFromMessage("tell me about the second one")).toBe(2);
  });

  it("returns 2 for '2nd'", () => {
    expect(ordinalFromMessage("the 2nd item")).toBe(2);
  });

  it("returns 3 for 'third'", () => {
    expect(ordinalFromMessage("what about the third?")).toBe(3);
  });

  it("returns 4 for 'fourth'", () => {
    expect(ordinalFromMessage("the fourth transaction")).toBe(4);
  });

  it("returns 5 for 'fifth'", () => {
    expect(ordinalFromMessage("the fifth one")).toBe(5);
  });

  it("returns 2 for Hebrew 'השני'", () => {
    expect(ordinalFromMessage("תראה לי את הסעיף השני")).toBe(2);
  });

  it("returns 1 for Hebrew 'הראשון'", () => {
    expect(ordinalFromMessage("הראשון בבקשה")).toBe(1);
  });

  it("returns null for a message with no ordinal", () => {
    expect(ordinalFromMessage("show me my balance")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(ordinalFromMessage("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// totalsMemoryUpdate
// ---------------------------------------------------------------------------
describe("totalsMemoryUpdate", () => {
  it("produces a 'sent' memory update with the correct sourceToolName", () => {
    const cp = cpOf("rani");
    const update = totalsMemoryUpdate(cp, "sent", 320);
    expect(update.totals).toHaveLength(1);
    expect(update.totals[0]?.sourceToolName).toBe("getTotalSentToCounterparty");
    expect(update.totals[0]?.amount).toBe(320);
    expect(update.totals[0]?.direction).toBe("sent");
    expect(update.totals[0]?.counterpartyEmail).toBe("rani@example.com");
  });

  it("produces a 'received' memory update with the correct sourceToolName", () => {
    const cp = cpOf("dan");
    const update = totalsMemoryUpdate(cp, "received", 200);
    expect(update.totals[0]?.sourceToolName).toBe("getTotalReceivedFromCounterparty");
    expect(update.totals[0]?.direction).toBe("received");
    expect(update.totals[0]?.amount).toBe(200);
  });

  it("produces a 'net' memory update with the correct sourceToolName", () => {
    const cp = cpOf("dan");
    const net = cp.totalReceived - cp.totalSent;
    const update = totalsMemoryUpdate(cp, "net", net);
    expect(update.totals[0]?.sourceToolName).toBe("getNetWithCounterparty");
    expect(update.totals[0]?.direction).toBe("net");
    expect(update.totals[0]?.amount).toBe(net);
  });

  it("sets the id as '<direction>:<email>'", () => {
    const cp = cpOf("noa");
    const update = totalsMemoryUpdate(cp, "sent", 75);
    expect(update.totals[0]?.id).toBe("sent:noa@example.com");
  });

  it("includes a counterparties entry with the correct relation for sent", () => {
    const cp = cpOf("rani");
    const update = totalsMemoryUpdate(cp, "sent", 100);
    expect(update.counterparties).toHaveLength(1);
    expect(update.counterparties[0]?.relation).toBe("sent_to");
    expect(update.counterparties[0]?.displayName).toBe("Rani Cohen");
  });

  it("includes a counterparties entry with relation 'received_from' for received", () => {
    const cp = cpOf("dan");
    const update = totalsMemoryUpdate(cp, "received", 200);
    expect(update.counterparties[0]?.relation).toBe("received_from");
  });

  it("includes standard aliases in the totals entry", () => {
    const cp = cpOf("rani");
    const update = totalsMemoryUpdate(cp, "sent", 50);
    expect(update.totals[0]?.aliases).toContain("that amount");
    expect(update.totals[0]?.aliases).toContain("that total");
  });
});

// ---------------------------------------------------------------------------
// WORLD constant sanity checks
// ---------------------------------------------------------------------------
describe("WORLD constant", () => {
  it("has a positive account balance", () => {
    expect(WORLD.account.balance).toBeGreaterThan(0);
  });

  it("has dailyRemaining = dailyLimit - dailyUsed", () => {
    const { dailyLimit, dailyUsed, dailyRemaining } = WORLD.limits;
    expect(dailyRemaining).toBe(dailyLimit - dailyUsed);
  });
});

// ---------------------------------------------------------------------------
// WORLD_RECENT_TX sanity checks
// ---------------------------------------------------------------------------
describe("WORLD_RECENT_TX", () => {
  it("contains at least 3 entries", () => {
    expect(WORLD_RECENT_TX.length).toBeGreaterThanOrEqual(3);
  });

  it("each entry has a direction of 'sent' or 'received'", () => {
    for (const tx of WORLD_RECENT_TX) {
      expect(["sent", "received"]).toContain(tx.direction);
    }
  });

  it("the first entry is the most recent (newest occurredAt first)", () => {
    for (let i = 1; i < WORLD_RECENT_TX.length; i++) {
      expect(WORLD_RECENT_TX[i - 1]!.occurredAt >= WORLD_RECENT_TX[i]!.occurredAt).toBe(true);
    }
  });
});
