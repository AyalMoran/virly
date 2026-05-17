import type { Types } from "mongoose";
import { PersonalDetails } from "../models/PersonalDetails.js";
import { User } from "../models/User.js";

type UserDocument = InstanceType<typeof User>;
type PersonalDetailsDocument = InstanceType<typeof PersonalDetails>;

function getObjectId(value: unknown): Types.ObjectId | null {
  if (value && typeof value === "object" && "_id" in value) {
    return (value as { _id: Types.ObjectId })._id;
  }

  return value as Types.ObjectId | null;
}

export async function ensurePersonalDetails(
  user: UserDocument
): Promise<PersonalDetailsDocument> {
  const personalDetailsId = getObjectId(user.personalDetails);

  if (personalDetailsId) {
    const existingDetails = await PersonalDetails.findById(personalDetailsId);
    if (existingDetails) {
      return existingDetails;
    }
  }

  let details = await PersonalDetails.findOne({ userId: user._id });

  if (!details) {
    details = await PersonalDetails.create({
      userId: user._id,
      status: "not_provided"
    });
  }

  user.personalDetails = details._id;
  await user.save();

  return details;
}

export function toAuthUserDto(user: UserDocument, details: PersonalDetailsDocument) {
  return {
    id: user.id,
    email: user.email,
    balance: user.balance,
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
