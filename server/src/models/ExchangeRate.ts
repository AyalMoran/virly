import { Schema, model } from "mongoose";

const exchangeRateSchema = new Schema(
  {
    baseCurrency: {
      type: String,
      required: true
    },
    rates: {
      type: Schema.Types.Mixed,
      required: true
    },
    provider: {
      type: String,
      required: true
    },
    fetchedAt: {
      type: Date,
      required: true
    },
    validForDate: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    sourceResponseHash: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    collection: "exchange_rates"
  }
);

exchangeRateSchema.index({ baseCurrency: 1, validForDate: 1 }, { unique: true });
exchangeRateSchema.index({ baseCurrency: 1, fetchedAt: -1 });

export const ExchangeRate = model("ExchangeRate", exchangeRateSchema);
