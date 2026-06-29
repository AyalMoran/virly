import {
  deriveDisplayNameFromEmail,
  resolveRelationshipStatus,
  roundMoney,
  toPublicUserProfileDto,
  toRelationshipTransactionDto
} from "../user-profile-dto.js";
import type { TransactionRecord, UserRecord } from "../../repositories/types.js";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    email: "alice.smith@example.com",
    passwordHash: "h",
    phone: "+972",
    isVerified: true,
    balance: 0,
    role: "user",
    personalDetails: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("roundMoney", () => {
  test("rounds to two decimals", () => {
    expect(roundMoney(1.005)).toBe(1.0); // floating-point: 1.005 -> 1.00
    expect(roundMoney(2.345)).toBe(2.35);
    expect(roundMoney(10)).toBe(10);
  });
});

describe("deriveDisplayNameFromEmail", () => {
  test("title-cases and joins local-part segments", () => {
    expect(deriveDisplayNameFromEmail("alice.smith@example.com")).toBe(
      "Alice Smith"
    );
    expect(deriveDisplayNameFromEmail("bob_jones-doe@x.io")).toBe(
      "Bob Jones Doe"
    );
  });

  test("handles a single-segment local part", () => {
    expect(deriveDisplayNameFromEmail("alice@example.com")).toBe("Alice");
  });

  test("falls back to a generic name for an empty local part", () => {
    expect(deriveDisplayNameFromEmail("@example.com")).toBe("Virly user");
  });
});

describe("toPublicUserProfileDto", () => {
  test("prefers a provided personal name", () => {
    const dto = toPublicUserProfileDto(makeUser(), {
      firstName: "Alice",
      lastName: "Wonder"
    });
    expect(dto.displayName).toBe("Alice Wonder");
    expect(dto.id).toBe("u1");
    expect(dto.isVerified).toBe(true);
    expect(dto.memberSince).toBe("2026-01-01T00:00:00.000Z");
  });

  test("derives a display name from email when no personal name", () => {
    expect(toPublicUserProfileDto(makeUser()).displayName).toBe("Alice Smith");
    expect(
      toPublicUserProfileDto(makeUser(), { firstName: null, lastName: null })
        .displayName
    ).toBe("Alice Smith");
  });
});

describe("toRelationshipTransactionDto", () => {
  function makeTx(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
    return {
      id: "t1",
      ownerId: "u1",
      counterpartyEmail: "bob@example.com",
      amount: 50,
      type: "debit",
      reason: "Dinner",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      ...overrides
    } as TransactionRecord;
  }

  test("maps a debit to a sent transaction", () => {
    const dto = toRelationshipTransactionDto(makeTx());
    expect(dto.direction).toBe("sent");
    expect(dto.status).toBe("completed");
    expect(dto.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(dto.description).toBe("Dinner");
  });

  test("maps a credit to a received transaction and undefined reason", () => {
    const dto = toRelationshipTransactionDto(
      makeTx({ type: "credit", reason: null })
    );
    expect(dto.direction).toBe("received");
    expect(dto.description).toBeUndefined();
  });
});

describe("resolveRelationshipStatus", () => {
  test("self takes precedence", () => {
    expect(
      resolveRelationshipStatus({
        isSelf: true,
        transactionCount: 5,
        isVerifiedRecipient: true
      })
    ).toBe("self");
  });

  test("no history when count is zero", () => {
    expect(
      resolveRelationshipStatus({
        isSelf: false,
        transactionCount: 0,
        isVerifiedRecipient: false
      })
    ).toBe("no_history");
  });

  test("verified recipient vs plain history", () => {
    expect(
      resolveRelationshipStatus({
        isSelf: false,
        transactionCount: 3,
        isVerifiedRecipient: true
      })
    ).toBe("verified_recipient");
    expect(
      resolveRelationshipStatus({
        isSelf: false,
        transactionCount: 3,
        isVerifiedRecipient: false
      })
    ).toBe("has_history");
  });
});
