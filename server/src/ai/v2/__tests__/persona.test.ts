import { buildPersonaSection } from "../persona.js";
import { assistantIds, getAssistantPersonality } from "../../assistants.js";

test("persona section includes name, role, a trait, and globalGuidance", () => {
  const s = buildPersonaSection("oshri", "he");
  const p = getAssistantPersonality("oshri");
  expect(s).toMatch(/\[PERSONA\] You are Oshri/);
  expect(s.includes(p.role)).toBeTruthy();
  expect(s.includes(p.traits[0]!)).toBeTruthy();
  expect(s.includes(p.globalGuidance.slice(0, 24))).toBeTruthy();
});

test("every persona carries the serious-situations rule, and an English reply carries the Hebrew-leak guard", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id, "en");
    expect(s).toMatch(/SERIOUS SITUATIONS/);
    expect(s).toMatch(/do NOT inject Hebrew/);
  }
});

test("personas are distinguishable and carry distinct traits", () => {
  expect(buildPersonaSection("oshri", "he")).not.toBe(buildPersonaSection("yehuda", "he"));
  expect(buildPersonaSection("yehuda", "he")).toMatch(/sarcastic/);
});

test("section commands a bold in-character voice and drops the old suppression", () => {
  for (const id of assistantIds) {
    const s = buildPersonaSection(id, "he");
    // Bold directive: fully in character, identifiable from tone alone.
    expect(s).toMatch(/STAY IN CHARACTER/);
    expect(s).toMatch(/from the tone alone/);
    // The self-undermining wording that muted the voice must be gone.
    expect(s).not.toMatch(/light garnish/);
    expect(s).not.toMatch(/do NOT reuse them verbatim/);
  }
});

test("section actively tells the assistant to use its signature vocabulary", () => {
  const s = buildPersonaSection("oshri", "he");
  expect(s).toMatch(/YOUR VOCABULARY/);
});

test("the serious rule explicitly overrides the in-character directive", () => {
  for (const id of assistantIds) {
    expect(buildPersonaSection(id, "he")).toMatch(/OVERRIDES the in-character directive/);
  }
});

test("more exemplars surface than the old 4-phrase cap", () => {
  // Count the surfaced “…” quoted exemplars; bold mode shows a richer bank.
  const quoted = buildPersonaSection("chaya", "he").match(/“[^”]+”/g) ?? [];
  expect(quoted.length).toBeGreaterThan(4);
});

test("vocabulary is locale-aware: Hebrew uses phrases verbatim, English forbids Hebrew injection", () => {
  const oshri = getAssistantPersonality("oshri");
  const phrase = oshri.phrasePacks.balance_inquiry_success!.openings![0]!; // a real Hebrew opener
  const he = buildPersonaSection("oshri", "he");
  const en = buildPersonaSection("oshri", "en");
  // Hebrew turn: the phrase is offered for verbatim use.
  expect(he.includes(phrase)).toBeTruthy();
  expect(he).toMatch(/use them verbatim/);
  // English turn: still references the phrase, but forbids writing Hebrew.
  expect(en).toMatch(/do NOT inject Hebrew/);
  expect(en).toMatch(/ZERO Hebrew words/);
});
