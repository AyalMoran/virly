// server/src/models/CommunicationProfile.ts
import mongoose, { Schema } from "mongoose";

const dialSchema = new Schema(
  { value: { type: String, required: true }, provenance: { type: String, required: true }, updatedAt: { type: String, required: true } },
  { _id: false }
);
const communicationProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    formality: { type: dialSchema, default: null },
    verbosity: { type: dialSchema, default: null },
    complexity: { type: dialSchema, default: null },
    humor: { type: dialSchema, default: null },
    pace: { type: dialSchema, default: null },
    memory: { type: String, default: "" },
  },
  { timestamps: true }
);

export const CommunicationProfileModel =
  mongoose.models.CommunicationProfile || mongoose.model("CommunicationProfile", communicationProfileSchema);
