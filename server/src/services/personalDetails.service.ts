import { AppError } from "../utils/app-error.js";
import { getRepositories } from "../repositories/index.js";
import type {
  PersonalDetailsRecord,
  PublicUserRecord,
  UserRecord
} from "../repositories/types.js";

export type PersonalDetailsInput = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: {
    country: string;
    stateRegion?: string | null;
    city: string;
    street: string;
    addressLine2?: string | null;
    postalCode: string;
  };
};

export const personalDetailsService = {
  /**
   * Idempotent upsert — finds or creates the PersonalDetails record for the
   * given user via the repository's atomic ensureForUser.
   *
   * Only back-fills the User->PersonalDetails FK (via the user repository) when
   * the field is currently null/absent, so GET paths do not perform
   * unconditional writes.
   */
  async ensureForUser(
    user: UserRecord | PublicUserRecord
  ): Promise<PersonalDetailsRecord> {
    const details = await getRepositories().personalDetails.ensureForUser(user.id);

    // Back-fill the FK on the user record only when it is absent.
    if (!user.personalDetails) {
      await getRepositories().users.setPersonalDetails(user.id, details.id);
    }

    return details;
  },

  /**
   * Plain read — returns the PersonalDetails record for a userId, or null.
   */
  async getForUser(userId: string): Promise<PersonalDetailsRecord | null> {
    return getRepositories().personalDetails.findByUserId(userId);
  },

  /**
   * Returns { firstName, lastName } only when status is "provided".
   * Used for public display name on profile pages.
   */
  async getDisplayName(
    userId: string
  ): Promise<{ firstName: string | null; lastName: string | null } | null> {
    const details = await getRepositories().personalDetails.findByUserId(userId);

    if (!details || details.status !== "provided") {
      return null;
    }

    return { firstName: details.firstName ?? null, lastName: details.lastName ?? null };
  },

  /**
   * Update personal details for a user. Sets status to "provided".
   * Throws AppError(404) if no PersonalDetails record exists for the user.
   */
  async update(
    userId: string,
    input: PersonalDetailsInput
  ): Promise<PersonalDetailsRecord> {
    const details = await getRepositories().personalDetails.update(userId, {
      status: "provided",
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: new Date(input.dateOfBirth),
      address: input.address
    });

    if (!details) {
      throw new AppError(404, "Personal details not found.");
    }

    return details;
  },

  /**
   * Mark personal details as skipped by recording the current timestamp.
   * Throws AppError(404) if no PersonalDetails record exists for the user.
   */
  async markSkipped(userId: string): Promise<PersonalDetailsRecord> {
    const details = await getRepositories().personalDetails.update(userId, {
      lastSkippedAt: new Date()
    });

    if (!details) {
      throw new AppError(404, "Personal details not found.");
    }

    return details;
  }
};
