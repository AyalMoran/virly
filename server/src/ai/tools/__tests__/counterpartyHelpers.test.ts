import {
  normalizeCounterpartyEmail,
  getCounterpartyId,
  getLimitFromMessage,
  getDisplayOrFallback,
  getCounterpartyDisplays
} from "../counterpartyHelpers.js";
import {
  withRepos,
  makeUserRecord,
  makePersonalDetailsRecord
} from "./_repoKit.js";

// ---------------------------------------------------------------------------
// normalizeCounterpartyEmail
// ---------------------------------------------------------------------------
describe("normalizeCounterpartyEmail", () => {
  it("lowercases an already-lowercase email", () => {
    expect(normalizeCounterpartyEmail("alice@example.com")).toBe("alice@example.com");
  });

  it("lowercases a mixed-case email and trims whitespace", () => {
    expect(normalizeCounterpartyEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("handles an email that is already normalized", () => {
    expect(normalizeCounterpartyEmail("bob@test.org")).toBe("bob@test.org");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeCounterpartyEmail("   user@domain.net   ")).toBe("user@domain.net");
  });
});

// ---------------------------------------------------------------------------
// getCounterpartyId
// ---------------------------------------------------------------------------
describe("getCounterpartyId", () => {
  it("returns the normalized email as the ID", () => {
    expect(getCounterpartyId("Bob@Example.COM")).toBe("bob@example.com");
  });

  it("is idempotent on an already-normalized email", () => {
    const email = "carol@foo.io";
    expect(getCounterpartyId(email)).toBe(email);
  });
});

// ---------------------------------------------------------------------------
// getLimitFromMessage
// ---------------------------------------------------------------------------
describe("getLimitFromMessage", () => {
  it("extracts a literal number from 'last 5 transactions'", () => {
    expect(getLimitFromMessage("show me the last 5 transactions", 3, 10)).toBe(5);
  });

  it("extracts a number from 'recent 3 transfers'", () => {
    expect(getLimitFromMessage("recent 3 transfers", 3, 10)).toBe(3);
  });

  it("returns defaultLimit when message has no number", () => {
    expect(getLimitFromMessage("show my transactions", 3, 10)).toBe(3);
  });

  it("clamps extracted number to maxLimit", () => {
    expect(getLimitFromMessage("last 99 transactions", 3, 10)).toBe(10);
  });

  it("returns defaultLimit when extracted number is 0", () => {
    expect(getLimitFromMessage("last 0 transfers", 5, 10)).toBe(5);
  });

  it("extracts number from 'top 7'", () => {
    expect(getLimitFromMessage("top 7 sent transfers", 3, 10)).toBe(7);
  });

  it("extracts number from Hebrew pattern (אחרונים 3)", () => {
    expect(getLimitFromMessage("הראה לי 3 אחרונים", 5, 10)).toBe(3);
  });

  it("returns defaultLimit when number cannot be parsed", () => {
    expect(getLimitFromMessage("show some transactions", 4, 10)).toBe(4);
  });

  it("floors floating-point-like match to integer", () => {
    // The regex captures at most 2-digit numbers; "12" is within maxLimit of 20
    expect(getLimitFromMessage("show last 12 transactions", 3, 20)).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// getDisplayOrFallback
// ---------------------------------------------------------------------------
describe("getDisplayOrFallback", () => {
  it("returns the cached display when email is present (case-insensitive)", () => {
    const display = {
      counterpartyId: "alice@example.com",
      email: "alice@example.com",
      emailFull: "alice@example.com",
      emailMasked: "a***@example.com",
      displayName: "Alice",
      firstName: "Alice",
      lastName: null,
      userLabel: "alice@example.com",
      llmLabel: "a***@example.com",
      label: "alice@example.com"
    };
    const map = new Map([["alice@example.com", display]]);
    const result = getDisplayOrFallback(map, "ALICE@Example.COM");
    expect(result).toBe(display);
  });

  it("returns a fallback object when email is absent from the map", () => {
    const map = new Map();
    const result = getDisplayOrFallback(map, "unknown@example.com");
    expect(result.email).toBe("unknown@example.com");
    expect(result.counterpartyId).toBe("unknown@example.com");
    expect(result.emailMasked).toBe("u***@example.com");
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCounterpartyDisplays
// ---------------------------------------------------------------------------
describe("getCounterpartyDisplays", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns an empty map for an empty email list", async () => {
    cleanup = withRepos();
    const result = await getCounterpartyDisplays([]);
    expect(result.size).toBe(0);
  });

  it("returns a display entry with masked email when no user record exists", async () => {
    cleanup = withRepos({
      users: {
        ...({} as any),
        findByEmails: async () => []
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });
    const result = await getCounterpartyDisplays(["alice@example.com"]);
    expect(result.has("alice@example.com")).toBe(true);
    const display = result.get("alice@example.com")!;
    expect(display.emailMasked).toBe("a***@example.com");
    expect(display.firstName).toBeNull();
  });

  it("enriches display with name from personal details when available", async () => {
    const userRecord = makeUserRecord({ id: "u-1", email: "bob@example.com" });
    const details = makePersonalDetailsRecord({
      userId: "u-1",
      firstName: "Bob",
      lastName: "Jones"
    });
    cleanup = withRepos({
      users: {
        ...({} as any),
        findByEmails: async () => [userRecord]
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => [details]
      }
    });
    const result = await getCounterpartyDisplays(["bob@example.com"]);
    const display = result.get("bob@example.com")!;
    expect(display.firstName).toBe("Bob");
    expect(display.lastName).toBe("Jones");
    expect(display.displayName).toBe("Bob Jones");
  });

  it("deduplicates emails before querying", async () => {
    const calls: string[][] = [];
    cleanup = withRepos({
      users: {
        ...({} as any),
        findByEmails: async (emails: string[]) => {
          calls.push(emails);
          return [];
        }
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });
    await getCounterpartyDisplays(["alice@example.com", "ALICE@EXAMPLE.COM", "alice@example.com"]);
    expect(calls[0]).toHaveLength(1);
  });
});
