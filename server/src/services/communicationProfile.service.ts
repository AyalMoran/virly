import { getRepositories } from "../repositories/index.js";
import type { CommunicationProfileRecord } from "../repositories/types.js";
import {
  type CommunicationProfile,
  emptyCommunicationProfile,
  deriveAgeYears,
  seedProfileFromAge,
  isEmptyCommunicationProfile,
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
};
