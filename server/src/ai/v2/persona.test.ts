import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonaSection } from "./persona.js";
import { assistantIds, getAssistantPersonality } from "../assistants.js";

test("persona section includes name, role, a trait, and globalGuidance", () => {
  const s = buildPersonaSection("oshri");
  const p = getAssistantPersonality("oshri");
  assert.match(s, /\[PERSONA\] You are Oshri/);
  assert.ok(s.includes(p.role));
  assert.ok(s.includes(p.traits[0]!));
  assert.ok(s.includes(p.globalGuidance.slice(0, 24)));
});

test("every persona carries the serious-situations rule and the Hebrew-leak guard", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id);
    assert.match(s, /SERIOUS SITUATIONS/);
    assert.match(s, /do NOT inject Hebrew/);
  }
});

test("personas are distinguishable and carry distinct traits", () => {
  assert.notStrictEqual(buildPersonaSection("oshri"), buildPersonaSection("yehuda"));
  assert.match(buildPersonaSection("yehuda"), /sarcastic/);
});
