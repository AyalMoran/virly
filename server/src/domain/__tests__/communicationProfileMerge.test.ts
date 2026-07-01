import { applyUpdate, capMemory, emptyCommunicationProfile, MAX_COMMUNICATION_MEMORY_CHARS } from "../communicationProfile.js";

const NOW = "2026-07-01T00:00:00.000Z";

describe("applyUpdate", () => {
  it("sets a dial with provenance and timestamp", () => {
    const p = applyUpdate(emptyCommunicationProfile(), { verbosity: "brief" }, "learned", NOW);
    expect(p.verbosity).toEqual({ value: "brief", provenance: "learned", updatedAt: NOW });
  });

  it("learned overrides a seeded dial but not a user_set dial", () => {
    let p = applyUpdate(emptyCommunicationProfile(), { complexity: "simple", humor: "none" }, "seeded", NOW);
    p = applyUpdate(p, { humor: "none" }, "user_set", NOW); // pin humor as user_set
    p = applyUpdate(p, { complexity: "expert", humor: "playful" }, "learned", NOW);
    expect(p.complexity?.value).toBe("expert"); // seeded -> learned OK
    expect(p.humor?.value).toBe("none"); // user_set preserved
  });

  it("appends memory lines and never exceeds the char cap", () => {
    let p = emptyCommunicationProfile();
    p = applyUpdate(p, { appendMemory: "prefers short answers" }, "learned", NOW);
    expect(p.memory).toContain("prefers short answers");
    for (let i = 0; i < 200; i += 1) p = applyUpdate(p, { appendMemory: `interested in topic ${i}` }, "learned", NOW);
    expect(p.memory.length).toBeLessThanOrEqual(MAX_COMMUNICATION_MEMORY_CHARS);
    expect(p.memory).toContain("topic 199"); // newest kept
  });
});

describe("capMemory", () => {
  it("drops oldest lines until within the cap", () => {
    const long = Array.from({ length: 100 }, (_, i) => `- line ${i}`).join("\n");
    const capped = capMemory(long);
    expect(capped.length).toBeLessThanOrEqual(MAX_COMMUNICATION_MEMORY_CHARS);
    expect(capped).toContain("line 99");
  });
});
