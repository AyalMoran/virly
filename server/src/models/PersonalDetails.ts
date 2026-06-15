import { Schema, model } from "mongoose";

const addressSchema = new Schema(
  {
    country: {
      type: String,
      trim: true,
      default: null
    },
    stateRegion: {
      type: String,
      trim: true,
      default: null
    },
    city: {
      type: String,
      trim: true,
      default: null
    },
    street: {
      type: String,
      trim: true,
      default: null
    },
    addressLine2: {
      type: String,
      trim: true,
      default: null
    },
    postalCode: {
      type: String,
      trim: true,
      default: null
    }
  },
  { _id: false }
);

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
      type: addressSchema,
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
