import {
  assistantIds,
  DEFAULT_ASSISTANT_ID,
  assistantPersonalities,
  isAssistantId,
  getAssistantPersonality
} from "../assistants.js";

describe("assistantIds", () => {
  test("contains the four expected assistant IDs", () => {
    expect(assistantIds).toContain("oshri");
    expect(assistantIds).toContain("chaya");
    expect(assistantIds).toContain("yehuda");
    expect(assistantIds).toContain("yohai");
    expect(assistantIds).toHaveLength(4);
  });
});

describe("DEFAULT_ASSISTANT_ID", () => {
  test("is oshri", () => {
    expect(DEFAULT_ASSISTANT_ID).toBe("oshri");
  });

  test("is a valid assistant ID", () => {
    expect(assistantIds).toContain(DEFAULT_ASSISTANT_ID);
  });
});

describe("isAssistantId", () => {
  test("returns true for 'oshri'", () => {
    expect(isAssistantId("oshri")).toBe(true);
  });

  test("returns true for 'chaya'", () => {
    expect(isAssistantId("chaya")).toBe(true);
  });

  test("returns true for 'yehuda'", () => {
    expect(isAssistantId("yehuda")).toBe(true);
  });

  test("returns true for 'yohai'", () => {
    expect(isAssistantId("yohai")).toBe(true);
  });

  test("returns false for empty string", () => {
    expect(isAssistantId("")).toBe(false);
  });

  test("returns false for unknown ID", () => {
    expect(isAssistantId("unknown_bot")).toBe(false);
  });

  test("returns false for uppercase variant", () => {
    expect(isAssistantId("OSHRI")).toBe(false);
  });

  test("returns false for partial match", () => {
    expect(isAssistantId("osh")).toBe(false);
  });
});

describe("getAssistantPersonality", () => {
  test("returns oshri personality with correct id and name", () => {
    const p = getAssistantPersonality("oshri");
    expect(p.id).toBe("oshri");
    expect(p.name).toBe("Oshri");
  });

  test("returns chaya personality with correct id and name", () => {
    const p = getAssistantPersonality("chaya");
    expect(p.id).toBe("chaya");
    expect(p.name).toBe("Chaya");
  });

  test("returns yehuda personality with correct id and name", () => {
    const p = getAssistantPersonality("yehuda");
    expect(p.id).toBe("yehuda");
    expect(p.name).toBe("Yehuda");
  });

  test("returns yohai personality with correct id and name", () => {
    const p = getAssistantPersonality("yohai");
    expect(p.id).toBe("yohai");
    expect(p.name).toBe("Yohai");
  });

  test("returned personality has non-empty traits array", () => {
    const p = getAssistantPersonality("oshri");
    expect(Array.isArray(p.traits)).toBe(true);
    expect(p.traits.length).toBeGreaterThan(0);
  });

  test("returned personality has non-empty globalGuidance string", () => {
    const p = getAssistantPersonality("oshri");
    expect(typeof p.globalGuidance).toBe("string");
    expect(p.globalGuidance.length).toBeGreaterThan(0);
  });

  test("returned personality has phrasePacks object", () => {
    const p = getAssistantPersonality("oshri");
    expect(typeof p.phrasePacks).toBe("object");
  });
});

describe("assistantPersonalities — guardedPack behavior", () => {
  test("blocked situations have maxPhrases 0 for all assistants", () => {
    const blockedSituations = [
      "missing_required_transfer_details",
      "insufficient_funds",
      "transfer_failed",
      "security_sensitive"
    ] as const;

    for (const id of assistantIds) {
      const p = assistantPersonalities[id];
      for (const situation of blockedSituations) {
        const pack = p.phrasePacks[situation];
        expect(pack).toBeDefined();
        expect(pack!.maxPhrases).toBe(0);
      }
    }
  });

  test("blocked situations have non-empty guidance for all assistants", () => {
    const blockedSituations = [
      "missing_required_transfer_details",
      "insufficient_funds",
      "transfer_failed",
      "security_sensitive"
    ] as const;

    for (const id of assistantIds) {
      const p = assistantPersonalities[id];
      for (const situation of blockedSituations) {
        const pack = p.phrasePacks[situation];
        expect(typeof pack!.guidance).toBe("string");
        expect(pack!.guidance!.length).toBeGreaterThan(0);
      }
    }
  });

  test("guarded balance_inquiry_success has forbidden list containing transfer-success-only phrases", () => {
    // guardedPack prepends transferSuccessOnlyPhrases into forbidden
    for (const id of assistantIds) {
      const p = assistantPersonalities[id];
      const pack = p.phrasePacks["balance_inquiry_success"];
      expect(pack).toBeDefined();
      expect(Array.isArray(pack!.forbidden)).toBe(true);
      // At least one phrase from the transferSuccessOnlyPhrases list
      expect(pack!.forbidden!.some((f) => f === "הכסף כבר בדרך")).toBe(true);
    }
  });

  test("transfer_confirmed_success does NOT have transfer-success-only phrases in forbidden list", () => {
    // pack() (not guardedPack) is used for transfer_confirmed_success
    for (const id of assistantIds) {
      const p = assistantPersonalities[id];
      const pack = p.phrasePacks["transfer_confirmed_success"];
      expect(pack).toBeDefined();
      // The forbidden list should NOT contain transfer-success phrases (pack() is used)
      const forbiddenArr = pack!.forbidden ?? [];
      expect(forbiddenArr.includes("הכסף כבר בדרך")).toBe(false);
    }
  });

  test("every assistant has a role string", () => {
    for (const id of assistantIds) {
      const p = assistantPersonalities[id];
      expect(typeof p.role).toBe("string");
      expect(p.role.length).toBeGreaterThan(0);
    }
  });
});
