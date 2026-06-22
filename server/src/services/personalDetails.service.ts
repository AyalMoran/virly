import { PersonalDetails } from "../models/PersonalDetails.js";
import { AppError } from "../utils/app-error.js";
import { getRepositories } from "../repositories/index.js";
import type { PublicUserRecord, UserRecord } from "../repositories/types.js";

export type PersonalDetailsDocument = InstanceType<typeof PersonalDetails>;

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
   * Idempotent upsert — finds or creates the PersonalDetails doc for the
   * given user via a single atomic findOneAndUpdate with { upsert: true }.
   *
   * Only back-fills the User->PersonalDetails FK (via the user repository) when
   * the field is currently null/absent, so GET paths do not perform
   * unconditional writes.
   */
  async ensureForUser(
    user: UserRecord | PublicUserRecord
  ): Promise<PersonalDetailsDocument> {
    const details = await PersonalDetails.findOneAndUpdate(
      { userId: user.id },
      { $setOnInsert: { userId: user.id, status: "not_provided" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Back-fill the FK on the user record only when it is absent.
    if (!user.personalDetails) {
      await getRepositories().users.setPersonalDetails(user.id, String(details._id));
    }

    return details;
  },

  /**
   * Plain read — returns the PersonalDetails doc for a userId, or null.
   */
  async getForUser(userId: string): Promise<PersonalDetailsDocument | null> {
    return PersonalDetails.findOne({ userId });
  },

  /**
   * Returns { firstName, lastName } only when status is "provided".
   * Used for public display name on profile pages.
   */
  async getDisplayName(
    userId: string
  ): Promise<{ firstName: string | null; lastName: string | null } | null> {
    const details = await PersonalDetails.findOne({ userId });

    if (!details || details.status !== "provided") {
      return null;
    }

    return { firstName: details.firstName ?? null, lastName: details.lastName ?? null };
  },

  /**
   * Update personal details for a user. Sets status to "provided".
   * Throws AppError(404) if no PersonalDetails doc exists for the user.
   */
  async update(
    userId: string,
    input: PersonalDetailsInput
  ): Promise<PersonalDetailsDocument> {
    const details = await PersonalDetails.findOneAndUpdate(
      { userId },
      {
        $set: {
          status: "provided",
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: new Date(input.dateOfBirth),
          address: input.address
        }
      },
      { new: true }
    );

    if (!details) {
      throw new AppError(404, "Personal details not found.");
    }

    return details;
  },

  /**
   * Mark personal details as skipped by recording the current timestamp.
   * Throws AppError(404) if no PersonalDetails doc exists for the user.
   */
  async markSkipped(userId: string): Promise<PersonalDetailsDocument> {
    const details = await PersonalDetails.findOneAndUpdate(
      { userId },
      { $set: { lastSkippedAt: new Date() } },
      { new: true }
    );

    if (!details) {
      throw new AppError(404, "Personal details not found.");
    }

    return details;
  }
};
