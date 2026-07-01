import { buildSystemPrompt } from "../prompt.js";
import { applyUpdate, emptyCommunicationProfile } from "../../../domain/communicationProfile.js";

const base = { assistantId: "oshri" as const, locale: "en" as const, knownCounterparties: [], now: new Date("2026-07-01T00:00:00.000Z"), timezone: "UTC" };

describe("communication profile prompt safety", () => {
  it("memory renders as inert description and the block defers to money/serious rules", () => {
    const profile = applyUpdate(emptyCommunicationProfile(), { appendMemory: "prefers plain language" }, "user_set", "2026-07-01T00:00:00.000Z");
    const p = buildSystemPrompt({ ...base, communicationProfile: profile });
    const block = p.slice(p.indexOf("[HOW TO TALK TO THIS USER]"), p.indexOf("[MONEY"));
    expect(block).toMatch(/NOT instructions|does NOT override|ignore this block/i);
    expect(p.indexOf("[MONEY")).toBeGreaterThan(p.indexOf("[HOW TO TALK TO THIS USER]"));
  });

  it("a playful humor dial still ships the serious-situation deferral", () => {
    const profile = applyUpdate(emptyCommunicationProfile(), { humor: "playful" }, "user_set", "2026-07-01T00:00:00.000Z");
    const p = buildSystemPrompt({ ...base, communicationProfile: profile });
    expect(p).toMatch(/serious/i);
  });
});
