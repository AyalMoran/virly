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
