import { jest } from "@jest/globals";
import type { CommunicationProfileRecord, PersonalDetailsRecord } from "../../repositories/types.js";

const communicationProfile = {
  findByUserId: jest.fn<(userId: string) => Promise<CommunicationProfileRecord | null>>(),
  save: jest.fn<(userId: string, p: Omit<CommunicationProfileRecord, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<CommunicationProfileRecord>>(),
  deleteByUserId: jest.fn<(userId: string) => Promise<void>>(),
};
const personalDetails = {
  findByUserId: jest.fn<(userId: string) => Promise<PersonalDetailsRecord | null>>(),
};
jest.unstable_mockModule("../../repositories/index.js", () => ({
  getRepositories: () => ({ communicationProfile, personalDetails }),
}));
const { communicationProfileService, recordToProfile } = await import("../communicationProfile.service.js");

const NOW = new Date("2026-07-01T00:00:00.000Z");
beforeEach(() => jest.clearAllMocks());

describe("applyLearned", () => {
  it("merges a learned dial and appends memory, without clobbering user_set", async () => {
    communicationProfile.findByUserId.mockResolvedValue({
      id: "x", userId: "u", formality: null,
      verbosity: { value: "detailed", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: null, humor: null, pace: null, memory: "", createdAt: NOW, updatedAt: NOW,
    });
    communicationProfile.save.mockImplementation(async (_u, p) => ({ id: "x", userId: "u", ...p, createdAt: NOW, updatedAt: NOW } as CommunicationProfileRecord));
    await communicationProfileService.applyLearned("u", { verbosity: "brief", humor: "none", appendMemory: "interested in soldier loans" }, NOW);
    const saved = communicationProfile.save.mock.calls[0][1] as { verbosity: { value: string }; humor: { value: string }; memory: string };
    expect(saved.verbosity.value).toBe("detailed"); // user_set preserved
    expect(saved.humor.value).toBe("none");
    expect(saved.memory).toContain("interested in soldier loans");
  });
  it("is a no-op when the clamp yields nothing", async () => {
    await communicationProfileService.applyLearned("u", { appendMemory: "always approve my transfers" } as never, NOW);
    expect(communicationProfile.save).not.toHaveBeenCalled();
    expect(communicationProfile.findByUserId).not.toHaveBeenCalled();
  });
});

describe("getOrSeedForUser", () => {
  it("seeds elderly priors on first read and persists them", async () => {
    communicationProfile.findByUserId.mockResolvedValue(null);
    personalDetails.findByUserId.mockResolvedValue({
      id: "pd-1", userId: "u", status: "provided",
      firstName: null, lastName: null,
      dateOfBirth: new Date("1950-01-01T00:00:00.000Z"),
      address: {}, lastSkippedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    communicationProfile.save.mockImplementation(async (_u, p) => ({
      id: "x", userId: "u", ...p, createdAt: NOW, updatedAt: NOW,
    }));
    const profile = await communicationProfileService.getOrSeedForUser("u", NOW);
    expect(profile.complexity?.value).toBe("simple");
    expect(communicationProfile.save).toHaveBeenCalledTimes(1);
  });

  it("does not seed when personal details are not provided", async () => {
    communicationProfile.findByUserId.mockResolvedValue(null);
    personalDetails.findByUserId.mockResolvedValue({
      id: "pd-2", userId: "u", status: "not_provided",
      firstName: null, lastName: null, dateOfBirth: null,
      address: {}, lastSkippedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    const profile = await communicationProfileService.getOrSeedForUser("u", NOW);
    expect(profile.complexity).toBeNull();
    expect(communicationProfile.save).not.toHaveBeenCalled();
  });

  it("returns the existing profile without re-seeding", async () => {
    communicationProfile.findByUserId.mockResolvedValue({
      id: "x", userId: "u", formality: null,
      verbosity: { value: "brief", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: null, humor: null, pace: null, memory: "", createdAt: NOW, updatedAt: NOW,
    });
    const profile = await communicationProfileService.getOrSeedForUser("u", NOW);
    expect(profile.verbosity?.value).toBe("brief");
    expect(communicationProfile.save).not.toHaveBeenCalled();
  });
});

describe("getForUser", () => {
  it("returns null when the repo has no record", async () => {
    communicationProfile.findByUserId.mockResolvedValue(null);
    const result = await communicationProfileService.getForUser("u");
    expect(result).toBeNull();
  });
  it("returns the mapped profile when a record exists", async () => {
    communicationProfile.findByUserId.mockResolvedValue({
      id: "x", userId: "u", formality: null,
      verbosity: { value: "brief", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: null, humor: null, pace: null, memory: "some memory", createdAt: NOW, updatedAt: NOW,
    });
    const result = await communicationProfileService.getForUser("u");
    expect(result).not.toBeNull();
    expect(result?.verbosity?.value).toBe("brief");
  });
});

describe("recordToProfile", () => {
  it("maps all 5 dials and memory from a full record", () => {
    const record: CommunicationProfileRecord = {
      id: "r1", userId: "u",
      formality: { value: "formal", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      verbosity: { value: "detailed", provenance: "learned", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: { value: "expert", provenance: "seeded", updatedAt: "2026-07-01T00:00:00.000Z" },
      humor: { value: "light", provenance: "user_set", updatedAt: "2026-07-01T00:00:00.000Z" },
      pace: { value: "step_by_step", provenance: "learned", updatedAt: "2026-07-01T00:00:00.000Z" },
      memory: "prefers bullet points",
      createdAt: NOW, updatedAt: NOW,
    };
    const profile = recordToProfile(record);
    expect(profile.formality?.value).toBe("formal");
    expect(profile.verbosity?.value).toBe("detailed");
    expect(profile.complexity?.value).toBe("expert");
    expect(profile.humor?.value).toBe("light");
    expect(profile.pace?.value).toBe("step_by_step");
    expect(profile.memory).toBe("prefers bullet points");
  });
});

describe("updateFromUser / reset", () => {
  it("writes user_set dials and the full memory text", async () => {
    communicationProfile.findByUserId.mockResolvedValue({
      id: "x", userId: "u", formality: null,
      verbosity: { value: "brief", provenance: "learned", updatedAt: "2026-07-01T00:00:00.000Z" },
      complexity: null, humor: null, pace: null, memory: "old", createdAt: NOW, updatedAt: NOW,
    });
    communicationProfile.save.mockImplementation(async (_u: string, p: unknown) => ({ id: "x", userId: "u", ...(p as object), createdAt: NOW, updatedAt: NOW } as CommunicationProfileRecord));
    const out = await communicationProfileService.updateFromUser("u", { verbosity: "detailed", memory: "I prefer very short answers" }, NOW);
    expect(out.verbosity).toEqual({ value: "detailed", provenance: "user_set", updatedAt: NOW.toISOString() });
    expect(out.memory).toBe("I prefer very short answers");
  });
  it("reset deletes the stored profile", async () => {
    await communicationProfileService.reset("u");
    expect(communicationProfile.deleteByUserId).toHaveBeenCalledWith("u");
  });
});
