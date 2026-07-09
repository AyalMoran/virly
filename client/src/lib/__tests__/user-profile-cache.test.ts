// client/src/lib/__tests__/user-profile-cache.test.ts
import {
  fetchUserProfileCached,
  __resetUserProfileCache,
  __setProfileFetcher
} from "../user-profile-cache";

test("dedupes repeat fetches for the same email", async () => {
  __resetUserProfileCache();
  let calls = 0;
  __setProfileFetcher(async (email) => {
    calls += 1;
    return {
      user: { id: "1", email, displayName: "Dan", isVerified: false },
      relationship: {
        viewerUserId: "v", viewedUserId: "1", totalSentToUser: 0, totalReceivedFromUser: 0,
        netAmount: 0, transactionCount: 0, lastTransactionAt: null, isVerifiedRecipient: false,
        canTransferToUser: false, relationshipStatus: "no_history"
      },
      recentTransactions: []
    };
  });
  await fetchUserProfileCached("dan@example.com");
  await fetchUserProfileCached("dan@example.com");
  expect(calls).toBe(1);
});
