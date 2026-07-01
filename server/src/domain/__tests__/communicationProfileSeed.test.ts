import { deriveAgeYears, seedProfileFromAge, isEmptyCommunicationProfile } from "../communicationProfile.js";

const NOW = "2026-07-01T00:00:00.000Z";

describe("deriveAgeYears", () => {
  it("computes full years and ignores a not-yet-reached birthday", () => {
    expect(deriveAgeYears(new Date("1956-06-30T00:00:00.000Z"), new Date(NOW))).toBe(70);
    expect(deriveAgeYears(new Date("1956-07-02T00:00:00.000Z"), new Date(NOW))).toBe(69);
  });
});

describe("seedProfileFromAge", () => {
  it("seeds gentle accessibility priors for an elderly user, memory stays empty", () => {
    const p = seedProfileFromAge(72, NOW);
    expect(p.complexity).toEqual({ value: "simple", provenance: "seeded", updatedAt: NOW });
    expect(p.pace).toEqual({ value: "step_by_step", provenance: "seeded", updatedAt: NOW });
    expect(p.memory).toBe("");
  });

  it("seeds nothing for a non-elderly or unknown age", () => {
    expect(isEmptyCommunicationProfile(seedProfileFromAge(40, NOW))).toBe(true);
    expect(isEmptyCommunicationProfile(seedProfileFromAge(null, NOW))).toBe(true);
  });
});
