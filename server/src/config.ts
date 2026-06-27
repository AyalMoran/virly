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

// The JWT secret signs the auth token AND embeds the CSRF hash, so a known
// default is a full auth bypass. The placeholder is tolerated outside
// production for local dev/tests; in production a strong, explicitly-set
// secret is required and the server fails fast on boot otherwise.
function resolveJwtSecret(): string {
  const secret = getStringEnv("VIRLY_JWT_SECRET", "change-me-in-production", {
    aliases: ["JWT_SECRET"]
  });

  if (
    isProduction &&
    (secret === "change-me-in-production" || secret.length < 32)
  ) {
    throw new Error(
      "VIRLY_JWT_SECRET must be set to a strong secret (>= 32 characters) in production."
    );
  }

  return secret;
}

const jwtSecret = resolveJwtSecret();

function resolveDbDriver(): "mongo" | "postgres" {
  // Guard against the string "undefined" that process.env coerces from
  // undefined values (e.g. Object.assign(process.env, {KEY: undefined})).
  const envVal = process.env.VIRLY_DB_DRIVER;
  const effective = !envVal || envVal === "undefined" ? undefined : envVal;
  const raw = (effective ?? "mongo").trim().toLowerCase();
  if (raw !== "mongo" && raw !== "postgres") {
    throw new Error("VIRLY_DB_DRIVER must be one of: mongo, postgres.");
  }
  return raw;
}

const dbDriver = resolveDbDriver();

function resolvePostgresUrl(): string | undefined {
  const raw = getOptionalStringEnv("VIRLY_POSTGRES_URL", {
    aliases: ["POSTGRES_URL", "DATABASE_URL"]
  });
  // Guard against the string "undefined" that process.env coerces from
  // undefined values (e.g. Object.assign(process.env, {KEY: undefined})).
  return raw === "undefined" ? undefined : raw;
}

const postgresUrl = resolvePostgresUrl();

if (dbDriver === "postgres" && !postgresUrl) {
  throw new Error("VIRLY_POSTGRES_URL is required when VIRLY_DB_DRIVER=postgres.");
}

// The RAG knowledge base lives in a DEDICATED Postgres (pgvector), independent of
// VIRLY_DB_DRIVER — so it is reachable even in mongo mode. It falls back to the
// app's Postgres URL when a separate one isn't supplied. See RAG_PLAN.md §1.
function resolveAiPgUrl(): string | undefined {
  const raw = getOptionalStringEnv("VIRLY_AI_PG_URL", {
    aliases: ["VIRLY_VECTOR_DB_URL"]
  });
  const cleaned = raw === "undefined" ? undefined : raw;
  return cleaned ?? postgresUrl;
}

const aiPgUrl = resolveAiPgUrl();

const ragEnabled = getBooleanEnv("VIRLY_RAG_ENABLED", { defaultValue: false });

if (ragEnabled && !aiPgUrl) {
  throw new Error(
    "VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) is required when VIRLY_RAG_ENABLED is on."
  );
}

const ragMinScoreRaw = getOptionalStringEnv("VIRLY_RAG_MIN_SCORE");
const ragMinScore = ragMinScoreRaw === undefined ? 0 : Number(ragMinScoreRaw);
if (!Number.isFinite(ragMinScore) || ragMinScore < 0 || ragMinScore > 1) {
  throw new Error("VIRLY_RAG_MIN_SCORE must be a number between 0 and 1.");
}

// Where the LangGraph checkpointer + long-term store live (RAG_PLAN.md §7 / M1.5).
// Orthogonal to VIRLY_DB_DRIVER: "postgres" puts AI memory on the dedicated AI
// Postgres (single-store end-state); "mongo" (default) keeps the prior behavior.
// Reversible by an env flip, mirroring the app-DB driver.
function resolveAiMemoryBackend(): "mongo" | "postgres" {
  // Guard against the string "undefined" that process.env can coerce from an
  // undefined value (same hazard resolveDbDriver guards) — default to mongo.
  const envVal = process.env.VIRLY_AI_MEMORY_BACKEND;
  const effective = !envVal || envVal === "undefined" ? undefined : envVal;
  const raw = (effective ?? "mongo").trim().toLowerCase();
  if (raw !== "mongo" && raw !== "postgres") {
    throw new Error("VIRLY_AI_MEMORY_BACKEND must be one of: mongo, postgres.");
  }
  return raw;
}

const aiMemoryBackend = resolveAiMemoryBackend();

if (aiMemoryBackend === "postgres" && !aiPgUrl) {
  throw new Error(
    "VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) is required when VIRLY_AI_MEMORY_BACKEND=postgres."
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
  jwtSecret,
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
    }),
    // Selects the assistant graph implementation. "v1" is the deterministic-first
    // graph (server/src/ai/graph.ts); "v2" is the LLM-first agent loop
    // (server/src/ai/v2/). Cutover: default is now "v2"; v1 + this flag remain so
    // rollback is a single env flip (VIRLY_AI_GRAPH_VERSION=v1). v1 teardown is a
    // later, separate change.
    graphVersion: (() => {
      const raw = getStringEnv("VIRLY_AI_GRAPH_VERSION", "v2").trim().toLowerCase();
      return raw === "v1" ? "v1" : "v2";
    })() as "v1" | "v2"
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
  },
  dbDriver,
  postgresUrl,
  /** Backend for the LangGraph checkpointer + long-term store ("mongo" | "postgres"). */
  aiMemoryBackend,
  rag: {
    // Feature flag — when off, the searchPolicyDocs tool stays inert (returns a
    // graceful "unavailable" message) so the app/evals run without an AI Postgres.
    enabled: ragEnabled,
    /** Dedicated pgvector Postgres for AI/ML data (vectors now; checkpointer in M1.5). */
    aiPgUrl,
    embeddingModel: getStringEnv("VIRLY_RAG_EMBEDDING_MODEL", "text-embedding-3-small"),
    /** Fixed vector width — must match the schema's vector(N) column. */
    embeddingDimensions: 1536,
    topK: getIntEnv("VIRLY_RAG_TOP_K", { defaultValue: 5, min: 1, max: 50 }),
    /** Drop retrieved chunks whose cosine similarity is below this (0..1). */
    minScore: ragMinScore,
    /** Local-folder ingestion source (M1) — path lives outside the repo. */
    localDir: getOptionalStringEnv("VIRLY_RAG_LOCAL_DIR"),
    /** Google Drive ingestion source (M2). Auth via a service account. */
    drive: {
      folderId: getOptionalStringEnv("VIRLY_RAG_DRIVE_FOLDER_ID"),
      /** Service-account key as a raw JSON string... */
      serviceAccountJson: getOptionalStringEnv("VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON"),
      /** ...or a path to the key file (one of the two is required for Drive). */
      serviceAccountFile: getOptionalStringEnv("VIRLY_GOOGLE_APPLICATION_CREDENTIALS", {
        aliases: ["GOOGLE_APPLICATION_CREDENTIALS"]
      })
    }
  }
};
