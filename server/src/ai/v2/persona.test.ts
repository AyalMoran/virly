import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonaSection } from "./persona.js";
import { assistantIds, getAssistantPersonality } from "../assistants.js";

test("persona section includes name, role, a trait, and globalGuidance", () => {
  const s = buildPersonaSection("oshri", "he");
  const p = getAssistantPersonality("oshri");
  assert.match(s, /\[PERSONA\] You are Oshri/);
  assert.ok(s.includes(p.role));
  assert.ok(s.includes(p.traits[0]!));
  assert.ok(s.includes(p.globalGuidance.slice(0, 24)));
});

test("every persona carries the serious-situations rule, and an English reply carries the Hebrew-leak guard", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id, "en");
    assert.match(s, /SERIOUS SITUATIONS/);
    assert.match(s, /do NOT inject Hebrew/);
  }
});

test("personas are distinguishable and carry distinct traits", () => {
  assert.notStrictEqual(buildPersonaSection("oshri", "he"), buildPersonaSection("yehuda", "he"));
  assert.match(buildPersonaSection("yehuda", "he"), /sarcastic/);
});

test("section commands a bold in-character voice and drops the old suppression", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id, "he");
    // Bold directive: fully in character, identifiable from tone alone.
    assert.match(s, /STAY IN CHARACTER/);
    assert.match(s, /from the tone alone/);
    // The self-undermining wording that muted the voice must be gone.
    assert.doesNotMatch(s, /light garnish/);
    assert.doesNotMatch(s, /do NOT reuse them verbatim/);
  }
});

test("section actively tells the assistant to use its signature vocabulary", () => {
  const s = buildPersonaSection("oshri", "he");
  assert.match(s, /YOUR VOCABULARY/);
});

test("the serious rule explicitly overrides the in-character directive", () => {
  for (const id of assistantIds) {
    assert.match(buildPersonaSection(id, "he"), /OVERRIDES the in-character directive/);
  }
});

test("more exemplars surface than the old 4-phrase cap", () => {
  // Count the surfaced “…” quoted exemplars; bold mode shows a richer bank.
  const quoted = buildPersonaSection("chaya", "he").match(/“[^”]+”/g) ?? [];
  assert.ok(quoted.length > 4, `expected >4 exemplars, got ${quoted.length}`);
});

test("vocabulary is locale-aware: Hebrew uses phrases verbatim, English forbids Hebrew injection", () => {
  const oshri = getAssistantPersonality("oshri");
  const phrase = oshri.phrasePacks.balance_inquiry_success!.openings![0]!; // a real Hebrew opener
  const he = buildPersonaSection("oshri", "he");
  const en = buildPersonaSection("oshri", "en");
  // Hebrew turn: the phrase is offered for verbatim use.
  assert.ok(he.includes(phrase));
  assert.match(he, /use them verbatim/);
  // English turn: still references the phrase, but forbids writing Hebrew.
  assert.match(en, /do NOT inject Hebrew/);
  assert.match(en, /ZERO Hebrew words/);
});
