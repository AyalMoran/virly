import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, default: null }
  },
  { timestamps: true }
);

contactSchema.index({ ownerId: 1, email: 1 }, { unique: true });

export const Contact = mongoose.model("Contact", contactSchema);
