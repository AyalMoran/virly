import { z } from "zod";

export type CommunicationFormality = "casual" | "neutral" | "formal";
export type CommunicationVerbosity = "brief" | "standard" | "detailed";
export type CommunicationComplexity = "simple" | "standard" | "expert";
export type CommunicationHumor = "none" | "light" | "playful";
export type CommunicationPace = "step_by_step" | "standard";
export type CommunicationProvenance = "seeded" | "learned" | "user_set";

export type CommunicationDialState<T extends string> = {
  value: T;
  provenance: CommunicationProvenance;
  updatedAt: string; // ISO 8601
};

export type CommunicationProfile = {
  formality: CommunicationDialState<CommunicationFormality> | null;
  verbosity: CommunicationDialState<CommunicationVerbosity> | null;
  complexity: CommunicationDialState<CommunicationComplexity> | null;
  humor: CommunicationDialState<CommunicationHumor> | null;
  pace: CommunicationDialState<CommunicationPace> | null;
  memory: string; // char-capped free-text; "" when empty
};

export const DIAL_KEYS = ["formality", "verbosity", "complexity", "humor", "pace"] as const;
export type DialKey = (typeof DIAL_KEYS)[number];

export const MAX_COMMUNICATION_MEMORY_CHARS = 1000;
export const ELDERLY_AGE_THRESHOLD = 65;

const PROVENANCE_RANK: Record<CommunicationProvenance, number> = { seeded: 0, learned: 1, user_set: 2 };

export function provenanceRank(p: CommunicationProvenance): number {
  return PROVENANCE_RANK[p];
}

export function emptyCommunicationProfile(): CommunicationProfile {
  return { formality: null, verbosity: null, complexity: null, humor: null, pace: null, memory: "" };
}

export function isEmptyCommunicationProfile(p: CommunicationProfile): boolean {
  return !p.formality && !p.verbosity && !p.complexity && !p.humor && !p.pace && p.memory.trim() === "";
}

export type CommunicationProfileUpdate = {
  formality?: CommunicationFormality;
  verbosity?: CommunicationVerbosity;
  complexity?: CommunicationComplexity;
  humor?: CommunicationHumor;
  pace?: CommunicationPace;
  appendMemory?: string; // one concise line to append to the free-text memory
};

// Keep the newest lines that fit under the cap (drop oldest first).
export function capMemory(text: string): string {
  if (text.length <= MAX_COMMUNICATION_MEMORY_CHARS) return text;
  const lines = text.split("\n");
  while (lines.length > 1 && lines.join("\n").length > MAX_COMMUNICATION_MEMORY_CHARS) lines.shift();
  return lines.join("\n").slice(-MAX_COMMUNICATION_MEMORY_CHARS);
}

function appendMemoryLine(memory: string, line: string): string {
  const clean = line.trim().replace(/\s+/g, " ");
  if (!clean) return memory;
  const bullet = `- ${clean}`;
  return capMemory(memory ? `${memory}\n${bullet}` : bullet);
}

function setDial<T extends string>(
  existing: CommunicationDialState<T> | null,
  value: T | undefined,
  provenance: CommunicationProvenance,
  now: string
): CommunicationDialState<T> | null {
  if (value === undefined) return existing;
  if (existing && provenanceRank(provenance) < provenanceRank(existing.provenance)) return existing;
  return { value, provenance, updatedAt: now };
}

export function applyUpdate(
  existing: CommunicationProfile,
  update: CommunicationProfileUpdate,
  provenance: CommunicationProvenance,
  now: string
): CommunicationProfile {
  return {
    formality: setDial(existing.formality, update.formality, provenance, now),
    verbosity: setDial(existing.verbosity, update.verbosity, provenance, now),
    complexity: setDial(existing.complexity, update.complexity, provenance, now),
    humor: setDial(existing.humor, update.humor, provenance, now),
    pace: setDial(existing.pace, update.pace, provenance, now),
    memory: update.appendMemory ? appendMemoryLine(existing.memory, update.appendMemory) : existing.memory,
  };
}

// Age in full years from date-of-birth to `now`. Postgres stores dateOfBirth as
// timestamptz; supply a `now` in the user's timezone if day-precision matters
// (see ADR-0015 follow-on notes). UTC is used here.
export function deriveAgeYears(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  const beforeBirthday = monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Age seeds INITIAL behavior only - and only the clearest accessibility case.
// Everything else stays neutral until learned or user-set. Age never hard-locks;
// it is one seed factor. Interests are learned, not seeded.
export function seedProfileFromAge(ageYears: number | null, now: string): CommunicationProfile {
  if (ageYears === null || ageYears < ELDERLY_AGE_THRESHOLD) return emptyCommunicationProfile();
  return applyUpdate(emptyCommunicationProfile(), { complexity: "simple", pace: "step_by_step" }, "seeded", now);
}

const dialShape = {
  formality: z.enum(["casual", "neutral", "formal"]).optional(),
  verbosity: z.enum(["brief", "standard", "detailed"]).optional(),
  complexity: z.enum(["simple", "standard", "expert"]).optional(),
  humor: z.enum(["none", "light", "playful"]).optional(),
  pace: z.enum(["step_by_step", "standard"]).optional(),
};

// Internal learned-update shape: dials + a single memory line.
export const communicationProfileUpdateSchema = z
  .object({ ...dialShape, appendMemory: z.string().max(200).optional() })
  .strip();

// HTTP PUT shape: dials + the FULL memory text (user edits the whole thing).
export const communicationProfileUserInputSchema = z
  .object({ ...dialShape, memory: z.string().max(MAX_COMMUNICATION_MEMORY_CHARS).optional() })
  .strip();

const MAX_MEMORY_LINE = 160;
// Reject anything that reads like an instruction, money movement, or tool call.
const FORBIDDEN_MEMORY = /\b(approve|confirm|transfer|send|pay|withdraw|deposit|ignore|override|password|tool|api|execute)\b|[$€₪]/i;

export function sanitizeMemoryLine(text: string): string | undefined {
  const clean = (text ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_MEMORY_LINE);
  if (!clean) return undefined;
  if (FORBIDDEN_MEMORY.test(clean)) return undefined;
  return clean;
}

export function clampUpdate(input: unknown): CommunicationProfileUpdate {
  const source = (input ?? {}) as Record<string, unknown>;
  const out: CommunicationProfileUpdate = {};
  for (const key of DIAL_KEYS) {
    const parsed = communicationProfileUpdateSchema.shape[key].safeParse(source[key]);
    if (parsed.success && parsed.data !== undefined) (out as Record<string, unknown>)[key] = parsed.data;
  }
  if (typeof source.appendMemory === "string") {
    const line = sanitizeMemoryLine(source.appendMemory);
    if (line) out.appendMemory = line;
  }
  return out;
}
