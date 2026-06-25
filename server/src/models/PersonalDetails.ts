import { Schema, model } from "mongoose";

// Address is stored as a free-form map (Record<string, string | null>) so that
// the Mongo driver is behaviorally identical to the Postgres jsonb column:
// exactly the keys written are the keys returned, with no implicit defaults.
// Callers (service layer, DTOs) always supply the full set of keys they care
// about, so this change is backwards-compatible with all current call sites.
const personalDetailsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ["not_provided", "provided"],
      default: "not_provided",
      required: true
    },
    firstName: {
      type: String,
      trim: true,
      default: null
    },
    lastName: {
      type: String,
      trim: true,
      default: null
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    address: {
      type: Schema.Types.Mixed,
      default: () => ({})
    },
    lastSkippedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const PersonalDetails = model("PersonalDetails", personalDetailsSchema);
