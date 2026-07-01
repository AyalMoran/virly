// server/tests/contract/communicationProfile.contract.test.ts
import { describeContract } from "./harness.js";

describeContract("communicationProfile repository", {
  "returns null for a user with no profile": async ({ repos }) => {
    expect(await repos.communicationProfile.findByUserId("0".repeat(24))).toBeNull();
  },

  "saves and reads back dials and memory": async ({ repos }) => {
    const userId = "1".repeat(24);
    await repos.communicationProfile.save(userId, {
      formality: { value: "formal", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      verbosity: null,
      complexity: null,
      humor: null,
      pace: null,
      memory: "- prefers short answers",
    });
    const read = await repos.communicationProfile.findByUserId(userId);
    expect(read?.formality?.value).toBe("formal");
    expect(read?.memory).toContain("prefers short answers");
  },

  "save upserts by userId": async ({ repos }) => {
    const userId = "3".repeat(24);
    await repos.communicationProfile.save(userId, {
      formality: null,
      verbosity: { value: "brief", provenance: "learned", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: null,
      humor: null,
      pace: null,
      memory: "",
    });
    await repos.communicationProfile.save(userId, {
      formality: null,
      verbosity: { value: "detailed", provenance: "user_set", updatedAt: "2026-07-02T00:00:00.000Z" },
      complexity: null,
      humor: null,
      pace: null,
      memory: "",
    });
    const read = await repos.communicationProfile.findByUserId(userId);
    expect(read?.verbosity?.value).toBe("detailed");
  },

  "deleteByUserId removes the record": async ({ repos }) => {
    const userId = "4".repeat(24);
    await repos.communicationProfile.save(userId, {
      formality: null,
      verbosity: null,
      complexity: null,
      humor: null,
      pace: null,
      memory: "",
    });
    await repos.communicationProfile.deleteByUserId(userId);
    expect(await repos.communicationProfile.findByUserId(userId)).toBeNull();
  },
});
