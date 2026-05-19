import dotenv from "dotenv";
import { getIntEnv, getOptionalStringEnv, getStringEnv } from "./utils/env.js";

dotenv.config();

export const config = {
  port: getIntEnv("VIRLY_PORT", {
    defaultValue: 3000,
    min: 1,
    max: 65535,
    aliases: ["PORT"]
  }),
  clientUrl: getStringEnv("VIRLY_CLIENT_URL", "http://localhost:5173", {
    aliases: ["CLIENT_URL"]
  }),
  serverUrl: getStringEnv("VIRLY_SERVER_URL", "http://localhost:3000", {
    aliases: ["SERVER_URL"]
  }),
  mongoUri: getStringEnv("VIRLY_MONGODB_URI", "mongodb://127.0.0.1:27017/virly", {
    aliases: ["MONGODB_URI"]
  }),
  jwtSecret: getStringEnv("VIRLY_JWT_SECRET", "change-me-in-production", {
    aliases: ["JWT_SECRET"]
  }),
  smtp: {
    host: getOptionalStringEnv("VIRLY_SMTP_HOST", { aliases: ["SMTP_HOST"] }),
    port: getIntEnv("VIRLY_SMTP_PORT", {
      defaultValue: 587,
      min: 1,
      max: 65535,
      aliases: ["SMTP_PORT"]
    }),
    user: getOptionalStringEnv("VIRLY_SMTP_USER", { aliases: ["SMTP_USER"] }),
    pass: getOptionalStringEnv("VIRLY_SMTP_PASS", { aliases: ["SMTP_PASS"] }),
    from: getStringEnv("VIRLY_SMTP_FROM", "virly@example.com", {
      aliases: ["SMTP_FROM"]
    })
  },
  ai: {
    perTransferLimit: getIntEnv("VIRLY_AI_MOCK_PER_TRANSFER_LIMIT", {
      defaultValue: 500,
      min: 1
    }),
    dailyTransferLimit: getIntEnv("VIRLY_AI_MOCK_DAILY_TRANSFER_LIMIT", {
      defaultValue: 1000,
      min: 1
    })
  }
};

export const isProduction = process.env.NODE_ENV === "production";
