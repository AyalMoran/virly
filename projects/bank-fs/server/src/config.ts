import dotenv from "dotenv";
import { getIntEnv, getOptionalStringEnv, getStringEnv } from "./utils/env.js";

dotenv.config();

export const config = {
  port: getIntEnv("BANK_FS_PORT", {
    defaultValue: 3000,
    min: 1,
    max: 65535,
    aliases: ["PORT"]
  }),
  clientUrl: getStringEnv("BANK_FS_CLIENT_URL", "http://localhost:5173", {
    aliases: ["CLIENT_URL"]
  }),
  serverUrl: getStringEnv("BANK_FS_SERVER_URL", "http://localhost:3000", {
    aliases: ["SERVER_URL"]
  }),
  mongoUri: getStringEnv("BANK_FS_MONGODB_URI", "mongodb://127.0.0.1:27017/bank-fs", {
    aliases: ["MONGODB_URI"]
  }),
  jwtSecret: getStringEnv("BANK_FS_JWT_SECRET", "change-me-in-production", {
    aliases: ["JWT_SECRET"]
  }),
  smtp: {
    host: getOptionalStringEnv("BANK_FS_SMTP_HOST", { aliases: ["SMTP_HOST"] }),
    port: getIntEnv("BANK_FS_SMTP_PORT", {
      defaultValue: 587,
      min: 1,
      max: 65535,
      aliases: ["SMTP_PORT"]
    }),
    user: getOptionalStringEnv("BANK_FS_SMTP_USER", { aliases: ["SMTP_USER"] }),
    pass: getOptionalStringEnv("BANK_FS_SMTP_PASS", { aliases: ["SMTP_PASS"] }),
    from: getStringEnv("BANK_FS_SMTP_FROM", "bankfs@example.com", {
      aliases: ["SMTP_FROM"]
    })
  }
};

export const isProduction = process.env.NODE_ENV === "production";
