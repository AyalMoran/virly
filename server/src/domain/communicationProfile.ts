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
