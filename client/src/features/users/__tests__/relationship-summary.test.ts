// client/src/features/users/__tests__/relationship-summary.test.ts
import { summarizeRelationship } from "../relationship-summary";
import type { UserProfileResponse } from "../../../lib/types";

function profile(over: Partial<UserProfileResponse["relationship"]> = {}): UserProfileResponse {
  return {
    user: { id: "1", email: "dan@example.com", displayName: "Dan", isVerified: true },
    relationship: {
      viewerUserId: "v",
      viewedUserId: "1",
      totalSentToUser: 300,
      totalReceivedFromUser: 100,
      netAmount: 200,
      transactionCount: 4,
      lastTransactionAt: "2026-06-20T10:00:00Z",
      isVerifiedRecipient: true,
      canTransferToUser: true,
      relationshipStatus: "has_history",
      ...over
    },
    recentTransactions: []
  };
}

describe("summarizeRelationship", () => {
  test("net positive is labelled 'Net sent'", () => {
    const d = summarizeRelationship(profile());
    expect(d.name).toBe("Dan");
    expect(d.netLabel).toBe("Net sent");
    expect(d.netAmount).toBe(200);
    expect(d.transactionCount).toBe(4);
  });

  test("net negative is labelled 'Net received'", () => {
    const d = summarizeRelationship(profile({ netAmount: -50 }));
    expect(d.netLabel).toBe("Net received");
  });

  test("zero net is 'Even'", () => {
    const d = summarizeRelationship(profile({ netAmount: 0 }));
    expect(d.netLabel).toBe("Even");
  });

  test("falls back to email when displayName is empty", () => {
    const p = profile();
    p.user.displayName = "";
    expect(summarizeRelationship(p).name).toBe("dan@example.com");
  });
});
