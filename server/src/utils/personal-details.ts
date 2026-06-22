import { PersonalDetails } from "../models/PersonalDetails.js";
import type { PublicUserRecord, UserRecord } from "../repositories/types.js";

type PersonalDetailsDocument = InstanceType<typeof PersonalDetails>;

export function toAuthUserDto(
  user: UserRecord | PublicUserRecord,
  details: PersonalDetailsDocument
) {
  return {
    id: user.id,
    email: user.email,
    balance: user.balance,
    role: user.role ?? "user",
    createdAt: user.createdAt,
    personalDetailsId: details.id,
    personalDetailsStatus: details.status,
    needsPersonalDetails: details.status !== "provided"
  };
}

export function toPersonalDetailsDto(details: PersonalDetailsDocument) {
  return {
    id: details.id,
    status: details.status,
    firstName: details.firstName,
    lastName: details.lastName,
    dateOfBirth: details.dateOfBirth?.toISOString() ?? null,
    address: {
      country: details.address?.country ?? null,
      stateRegion: details.address?.stateRegion ?? null,
      city: details.address?.city ?? null,
      street: details.address?.street ?? null,
      addressLine2: details.address?.addressLine2 ?? null,
      postalCode: details.address?.postalCode ?? null
    },
    lastSkippedAt: details.lastSkippedAt?.toISOString() ?? null,
    createdAt: details.createdAt?.toISOString(),
    updatedAt: details.updatedAt?.toISOString()
  };
}
