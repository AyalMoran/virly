import { emptyLongTermMemorySnapshot } from "../types.js";

describe("emptyLongTermMemorySnapshot", () => {
  test("returns an object with empty counterparties array", () => {
    const snap = emptyLongTermMemorySnapshot();
    expect(Array.isArray(snap.counterparties)).toBe(true);
    expect(snap.counterparties.length).toBe(0);
  });

  test("returns an object with empty preferences", () => {
    const snap = emptyLongTermMemorySnapshot();
    expect(snap.preferences).toBeDefined();
    expect(typeof snap.preferences).toBe("object");
    expect(Object.keys(snap.preferences).length).toBe(0);
  });

  test("returns an object with empty facts array", () => {
    const snap = emptyLongTermMemorySnapshot();
    expect(Array.isArray(snap.facts)).toBe(true);
    expect(snap.facts.length).toBe(0);
  });

  test("each call returns a fresh independent object", () => {
    const a = emptyLongTermMemorySnapshot();
    const b = emptyLongTermMemorySnapshot();
    a.counterparties.push({
      email: "x@example.com",
      relation: "sent_to"
    });
    // Mutating one snapshot must not affect another
    expect(b.counterparties.length).toBe(0);
  });

  test("facts arrays are independent across calls", () => {
    const a = emptyLongTermMemorySnapshot();
    const b = emptyLongTermMemorySnapshot();
    a.facts.push({ id: "f1", text: "test", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(b.facts.length).toBe(0);
  });

  test("preferences objects are independent across calls", () => {
    const a = emptyLongTermMemorySnapshot();
    const b = emptyLongTermMemorySnapshot();
    a.preferences.preferredLanguage = "he";
    expect(b.preferences.preferredLanguage).toBeUndefined();
  });
});
