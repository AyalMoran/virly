import dotenv from "dotenv";
import {
  getBooleanEnv,
  getIntEnv,
  getOptionalStringEnv,
  getStringEnv
} from "./utils/env.js";

dotenv.config();

export const isProduction = process.env.NODE_ENV === "production";

type CookieSameSite = "lax" | "strict" | "none";

function normalizeOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function getCookieSameSite(): CookieSameSite {
  const value = getStringEnv(
    "VIRLY_COOKIE_SAME_SITE",
    isProduction ? "none" : "lax",
    {
      aliases: ["COOKIE_SAME_SITE"]
    }
  ).toLowerCase();

  if (value !== "lax" && value !== "strict" && value !== "none") {
    throw new Error("VIRLY_COOKIE_SAME_SITE must be one of: lax, strict, none.");
  }

  return value;
}

const clientUrl = getStringEnv("VIRLY_CLIENT_URL", "http://localhost:5173", {
  aliases: ["CLIENT_URL"]
});

const videoProviderValues = [
  "jitsi-jaas",
  "jitsi-self-hosted",
  "jitsi-public-demo",
  "mock"
] as const;
type VideoProvider = (typeof videoProviderValues)[number];

const videoProvider = getStringEnv("VIRLY_VIDEO_PROVIDER", "jitsi-public-demo");

if (!videoProviderValues.includes(videoProvider as VideoProvider)) {
  throw new Error(
    "VIRLY_VIDEO_PROVIDER must be one of: jitsi-jaas, jitsi-self-hosted, jitsi-public-demo, mock."
  );
}

const jitsiPrivateKey = getOptionalStringEnv("VIRLY_JITSI_PRIVATE_KEY")?.replace(/\\n/g, "\n");
const jitsiAppId = getOptionalStringEnv("VIRLY_JITSI_APP_ID");
const jitsiKeyId = getOptionalStringEnv("VIRLY_JITSI_KID");
const signedJitsiProvider =
  videoProvider === "jitsi-jaas" || videoProvider === "jitsi-self-hosted";

if (signedJitsiProvider && !jitsiPrivateKey) {
  throw new Error(
    "VIRLY_JITSI_PRIVATE_KEY is required when VIRLY_VIDEO_PROVIDER is jitsi-jaas or jitsi-self-hosted."
  );
}

if (videoProvider === "jitsi-jaas" && (!jitsiAppId || !jitsiKeyId)) {
  throw new Error(
    "VIRLY_JITSI_APP_ID and VIRLY_JITSI_KID are required when VIRLY_VIDEO_PROVIDER is jitsi-jaas."
  );
}

export const config = {
  port: getIntEnv("VIRLY_PORT", {
    defaultValue: 3000,
    min: 1,
    max: 65535,
    aliases: ["PORT"]
  }),
  clientUrl,
  clientUrls: normalizeOrigins(clientUrl),
  serverUrl: getStringEnv("VIRLY_SERVER_URL", "http://localhost:3000", {
    aliases: ["SERVER_URL"]
  }),
  mongoUri: getStringEnv("VIRLY_MONGODB_URI", "mongodb://127.0.0.1:27017/virly", {
    aliases: ["MONGODB_URI"]
  }),
  jwtSecret: getStringEnv("VIRLY_JWT_SECRET", "change-me-in-production", {
    aliases: ["JWT_SECRET"]
  }),
  email: {
    resendApiKey: getOptionalStringEnv("RESEND_API_KEY"),
    from: getStringEnv("VIRLY_EMAIL_FROM", "Virly <verify@virly.ayal.online>", {
      aliases: ["EMAIL_FROM"]
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
    }),
    model: getStringEnv("VIRLY_AI_MODEL", "gpt-4o-mini", {
      aliases: ["AI_MODEL"]
    }),
    openAIApiKey: getStringEnv("OPENAI_API_KEY", "", {
      aliases: ["OPENAI_API_KEY"]
    }),
    debugTrace: getBooleanEnv("VIRLY_AI_DEBUG_TRACE", {
      defaultValue: false
    })
  },
  fx: {
    provider: getStringEnv("VIRLY_FX_PROVIDER", "exchangerate-api", {
      aliases: ["FX_PROVIDER"]
    }),
    apiKey: getOptionalStringEnv("VIRLY_FX_API_KEY", {
      aliases: ["EXCHANGE_RATE_API_KEY", "FX_API_KEY"]
    }),
    baseUrl: getOptionalStringEnv("VIRLY_FX_BASE_URL", {
      aliases: ["FX_BASE_URL"]
    }),
    cacheTtlHours: getIntEnv("VIRLY_FX_CACHE_TTL_HOURS", {
      defaultValue: 48,
      min: 1,
      max: 24 * 14
    })
  },
  video: {
    provider: videoProvider as VideoProvider,
    jitsi: {
      domain: getStringEnv("VIRLY_JITSI_DOMAIN", "meet.jit.si"),
      appId: jitsiAppId,
      audience: getStringEnv("VIRLY_JITSI_AUDIENCE", "jitsi"),
      issuer: getOptionalStringEnv("VIRLY_JITSI_ISSUER"),
      subject: getOptionalStringEnv("VIRLY_JITSI_SUBJECT"),
      keyId: jitsiKeyId,
      privateKey: jitsiPrivateKey,
      tokenTtlSeconds: getIntEnv("VIRLY_JITSI_TOKEN_TTL_SECONDS", {
        defaultValue: 900,
        min: 60,
        max: 3600
      })
    }
  },
  cookies: {
    sameSite: getCookieSameSite()
  }
};
