import {
  videoSessionTypeValues,
  videoSessionStatusValues,
  videoSessionProviderValues,
  videoSessionSourceValues,
} from "../VideoSession.js";

describe("videoSessionTypeValues", () => {
  it("contains support and sales", () => {
    expect(videoSessionTypeValues).toContain("support");
    expect(videoSessionTypeValues).toContain("sales");
  });

  it("contains exactly two types", () => {
    expect(videoSessionTypeValues).toHaveLength(2);
  });

  it("every entry is a non-empty string", () => {
    for (const t of videoSessionTypeValues) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unknown types", () => {
    const s = new Set(videoSessionTypeValues as readonly string[]);
    expect(s.has("marketing")).toBe(false);
    expect(s.has("")).toBe(false);
  });

  it("entries are unique", () => {
    expect(new Set(videoSessionTypeValues).size).toBe(videoSessionTypeValues.length);
  });
});

describe("videoSessionStatusValues", () => {
  it("contains all expected statuses", () => {
    const expected = [
      "requested",
      "waiting_for_agent",
      "active",
      "ended",
      "missed",
      "cancelled",
      "failed",
    ];
    for (const s of expected) {
      expect(videoSessionStatusValues).toContain(s);
    }
  });

  it("contains exactly seven statuses", () => {
    expect(videoSessionStatusValues).toHaveLength(7);
  });

  it("every entry is a non-empty string", () => {
    for (const s of videoSessionStatusValues) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unexpected statuses", () => {
    const set = new Set(videoSessionStatusValues as readonly string[]);
    expect(set.has("pending")).toBe(false);
    expect(set.has("scheduled")).toBe(false);
    expect(set.has("")).toBe(false);
  });

  it("entries are unique", () => {
    expect(new Set(videoSessionStatusValues).size).toBe(videoSessionStatusValues.length);
  });
});

describe("videoSessionProviderValues", () => {
  it("contains all expected providers", () => {
    expect(videoSessionProviderValues).toContain("jitsi-jaas");
    expect(videoSessionProviderValues).toContain("jitsi-self-hosted");
    expect(videoSessionProviderValues).toContain("jitsi-public-demo");
    expect(videoSessionProviderValues).toContain("mock");
  });

  it("contains exactly four providers", () => {
    expect(videoSessionProviderValues).toHaveLength(4);
  });

  it("every entry is a non-empty string", () => {
    for (const p of videoSessionProviderValues) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unknown providers", () => {
    const set = new Set(videoSessionProviderValues as readonly string[]);
    expect(set.has("zoom")).toBe(false);
    expect(set.has("webrtc")).toBe(false);
    expect(set.has("")).toBe(false);
  });

  it("entries are unique", () => {
    expect(new Set(videoSessionProviderValues).size).toBe(videoSessionProviderValues.length);
  });
});

describe("videoSessionSourceValues", () => {
  it("contains all expected sources", () => {
    expect(videoSessionSourceValues).toContain("dashboard");
    expect(videoSessionSourceValues).toContain("ai_assistant");
    expect(videoSessionSourceValues).toContain("transfer_flow");
    expect(videoSessionSourceValues).toContain("account_page");
  });

  it("contains exactly four sources", () => {
    expect(videoSessionSourceValues).toHaveLength(4);
  });

  it("every entry is a non-empty string", () => {
    for (const s of videoSessionSourceValues) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("does not contain unknown sources", () => {
    const set = new Set(videoSessionSourceValues as readonly string[]);
    expect(set.has("mobile")).toBe(false);
    expect(set.has("api")).toBe(false);
    expect(set.has("")).toBe(false);
  });

  it("entries are unique", () => {
    expect(new Set(videoSessionSourceValues).size).toBe(videoSessionSourceValues.length);
  });
});
