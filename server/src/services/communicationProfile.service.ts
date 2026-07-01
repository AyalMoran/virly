import { getRepositories } from "../repositories/index.js";
import type { CommunicationProfileRecord } from "../repositories/types.js";
import {
  type CommunicationProfile,
  type CommunicationProfileUpdate,
  type CommunicationDialState,
  emptyCommunicationProfile,
  deriveAgeYears,
  seedProfileFromAge,
  isEmptyCommunicationProfile,
  applyUpdate,
  clampUpdate,
  capMemory,
} from "../domain/communicationProfile.js";

export function recordToProfile(r: CommunicationProfileRecord): CommunicationProfile {
  return {
    formality: r.formality,
    verbosity: r.verbosity,
    complexity: r.complexity,
    humor: r.humor,
    pace: r.pace,
    memory: r.memory,
  };
}

export const communicationProfileService = {
  async getForUser(userId: string): Promise<CommunicationProfile | null> {
    const record = await getRepositories().communicationProfile.findByUserId(userId);
    return record ? recordToProfile(record) : null;
  },

  async getOrSeedForUser(userId: string, now: Date): Promise<CommunicationProfile> {
    const existing = await getRepositories().communicationProfile.findByUserId(userId);
    if (existing) return recordToProfile(existing);

    const details = await getRepositories().personalDetails.findByUserId(userId);
    const age =
      details && details.status === "provided" && details.dateOfBirth
        ? deriveAgeYears(details.dateOfBirth, now)
        : null;
    // Age is the first seed factor - add residence/other detail priors here as they gain clear mappings.
    const seeded = seedProfileFromAge(age, now.toISOString());
    if (isEmptyCommunicationProfile(seeded)) return emptyCommunicationProfile();

    const saved = await getRepositories().communicationProfile.save(userId, seeded);
    return recordToProfile(saved);
  },

  async applyLearned(userId: string, update: CommunicationProfileUpdate, now: Date): Promise<void> {
    const clamped = clampUpdate(update);
    if (Object.keys(clamped).length === 0) return;
    const existingRecord = await getRepositories().communicationProfile.findByUserId(userId);
    const existing = existingRecord ? recordToProfile(existingRecord) : emptyCommunicationProfile();
    const merged = applyUpdate(existing, clamped, "learned", now.toISOString());
    if (isEmptyCommunicationProfile(merged)) return;
    await getRepositories().communicationProfile.save(userId, merged);
  },

  async updateFromUser(
    userId: string,
    input: CommunicationProfileUpdate & { memory?: string },
    now: Date
  ): Promise<CommunicationProfile> {
    const { memory, appendMemory: _drop, ...dials } = input;
    const clampedDials = clampUpdate(dials);
    const existingRecord = await getRepositories().communicationProfile.findByUserId(userId);
    const existing = existingRecord ? recordToProfile(existingRecord) : emptyCommunicationProfile();
    // The Settings tab submits the user's COMPLETE intended dial state, so this is an
    // authoritative replace: a dial present in the payload becomes user_set; a dial the
    // user cleared back to "Auto" (absent) resets to null. Memory is set wholesale only
    // when provided, otherwise the existing memory is preserved.
    const nowIso = now.toISOString();
    const asUserDial = <T extends string>(value: T | undefined): CommunicationDialState<T> | null =>
      value === undefined ? null : { value, provenance: "user_set", updatedAt: nowIso };
    const merged: CommunicationProfile = {
      formality: asUserDial(clampedDials.formality),
      verbosity: asUserDial(clampedDials.verbosity),
      complexity: asUserDial(clampedDials.complexity),
      humor: asUserDial(clampedDials.humor),
      pace: asUserDial(clampedDials.pace),
      memory: typeof memory === "string" ? capMemory(memory) : existing.memory,
    };
    const saved = await getRepositories().communicationProfile.save(userId, merged);
    return recordToProfile(saved);
  },

  async reset(userId: string): Promise<void> {
    await getRepositories().communicationProfile.deleteByUserId(userId);
  },
};
