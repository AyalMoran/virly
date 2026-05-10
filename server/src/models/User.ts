import { Schema, model } from "mongoose";

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
    verificationTokenHash: {
      type: String,
      default: null
    },
    verificationTokenExpiresAt: {
      type: Date,
      default: null
    },
    balance: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

export const User = model("User", userSchema);
