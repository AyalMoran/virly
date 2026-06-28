import { Schema, model } from "mongoose";

export const userRoleValues = [
  "user",
  "support_agent",
  "sales_agent",
  "support_manager",
  "admin"
] as const;

export type UserRole = (typeof userRoleValues)[number];

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    personalDetails: {
      type: Schema.Types.ObjectId,
      ref: "PersonalDetails",
      default: null
    },
    balance: {
      type: Number,
      required: true
    },
    role: {
      type: String,
      enum: userRoleValues,
      default: "user",
      index: true
    }
  },
  {
    timestamps: true
  }
);

export const User = model("User", userSchema);
