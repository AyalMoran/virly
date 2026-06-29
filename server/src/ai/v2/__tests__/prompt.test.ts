import { buildSystemPrompt } from "../prompt.js";

const base = {
  locale: "en" as const,
  knownCounterparties: [],
  pendingConfirmation: null,
  now: new Date("2026-06-15T00:00:00.000Z"),
  timezone: "Asia/Jerusalem"
};

test("system prompt embeds the selected persona's voice + serious rule", () => {
  const p = buildSystemPrompt({ assistantId: "yehuda", ...base });
  expect(p).toMatch(/\[PERSONA\] You are Yehuda/);
  expect(p).toMatch(/sarcastic/);
  expect(p).toMatch(/SERIOUS SITUATIONS/);
  // Integration-specific: the persona block sits after the identity block and
  // before [CAPABILITIES] — content checks live in persona.test.ts.
  expect(p.indexOf("[PERSONA]")).toBeGreaterThan(p.indexOf("the Virly banking assistant"));
  expect(p.indexOf("[PERSONA]")).toBeLessThan(p.indexOf("[CAPABILITIES]"));
});

test("different personas produce different system prompts", () => {
  const a = buildSystemPrompt({ assistantId: "oshri", ...base });
  const b = buildSystemPrompt({ assistantId: "chaya", ...base });
  expect(a).not.toBe(b);
  expect(a).toMatch(/playful/);
});
