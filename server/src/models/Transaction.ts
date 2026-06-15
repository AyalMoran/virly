import { Schema, model } from "mongoose";

const transactionSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    counterpartyEmail: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true
    },
    directionLabel: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200
    },
    // FX metadata for transfers entered in a non-ILS currency. Display-only:
    // `amount` above stays the authoritative ILS ledger value.
    enteredCurrency: {
      type: String,
      enum: ["ILS", "USD", "EUR"],
      default: undefined
    },
    enteredAmount: {
      type: Number,
      default: undefined
    },
    exchangeRateUsed: {
      type: Number,
      default: undefined
    },
    exchangeRateFetchedAt: {
      type: Date,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

export const Transaction = model("Transaction", transactionSchema);
