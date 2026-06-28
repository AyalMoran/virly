import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.match(p, /\[PERSONA\] You are Yehuda/);
  assert.match(p, /sarcastic/);
  assert.match(p, /SERIOUS SITUATIONS/);
  // Integration-specific: the persona block sits after the identity block and
  // before [CAPABILITIES] — content checks live in persona.test.ts.
  assert.ok(p.indexOf("[PERSONA]") > p.indexOf("the Virly banking assistant"));
  assert.ok(p.indexOf("[PERSONA]") < p.indexOf("[CAPABILITIES]"));
});

test("different personas produce different system prompts", () => {
  const a = buildSystemPrompt({ assistantId: "oshri", ...base });
  const b = buildSystemPrompt({ assistantId: "chaya", ...base });
  assert.notStrictEqual(a, b);
  assert.match(a, /playful/);
});
