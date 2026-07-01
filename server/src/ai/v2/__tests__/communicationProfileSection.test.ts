import { buildCommunicationProfileSection } from "../communicationProfileSection.js";
import { emptyCommunicationProfile, applyUpdate } from "../../../domain/communicationProfile.js";

const NOW = "2026-07-01T00:00:00.000Z";

describe("buildCommunicationProfileSection", () => {
  it("returns empty string for an empty or undefined profile", () => {
    expect(buildCommunicationProfileSection(undefined, "en")).toBe("");
    expect(buildCommunicationProfileSection(emptyCommunicationProfile(), "en")).toBe("");
  });

  it("renders active dials plus a deferral clause", () => {
    const p = applyUpdate(emptyCommunicationProfile(), { complexity: "simple", verbosity: "brief" }, "seeded", NOW);
    const block = buildCommunicationProfileSection(p, "en");
    expect(block).toContain("[HOW TO TALK TO THIS USER]");
    expect(block).toMatch(/simple|plain/i);
    expect(block).toMatch(/brief|short|concise/i);
    expect(block).toMatch(/serious/i);
    expect(block).toMatch(/money|confirmation|number|warning/i);
    expect(block).toMatch(/does NOT override|never changes/i);
  });

  it("renders memory as inert description and forbids Hebrew injection when user writes English", () => {
    const p = applyUpdate(emptyCommunicationProfile(), { appendMemory: "interested in loans for soldiers" }, "learned", NOW);
    const block = buildCommunicationProfileSection(p, "en");
    expect(block).toContain("interested in loans for soldiers");
    expect(block).toMatch(/do NOT inject Hebrew|reference only/i);
  });
});
