import { emptyCommunicationProfile, isEmptyCommunicationProfile, provenanceRank } from "../communicationProfile.js";

describe("communicationProfile types", () => {
  it("empty profile has all null dials and empty memory", () => {
    const p = emptyCommunicationProfile();
    expect(p.formality).toBeNull();
    expect(p.memory).toBe("");
    expect(isEmptyCommunicationProfile(p)).toBe(true);
  });

  it("provenance ranks order seeded < learned < user_set", () => {
    expect(provenanceRank("seeded")).toBeLessThan(provenanceRank("learned"));
    expect(provenanceRank("learned")).toBeLessThan(provenanceRank("user_set"));
  });
});
