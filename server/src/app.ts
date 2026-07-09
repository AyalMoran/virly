import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { config, isProduction } from "./config.js";
import { parseCookies } from "./middleware/cookies.js";
import {
  devThrottleMiddleware,
  resolveDevThrottleMs,
  warnDevThrottleActive
} from "./middleware/devThrottle.js";
import { errorHandler } from "./middleware/error-handler.js";
import aiRoutes from "./routes/ai.routes.js";
import authRoutes from "./routes/auth.routes.js";
import exchangeRateRoutes from "./routes/exchangeRate.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import communicationProfileRoutes from "./routes/communicationProfile.routes.js";
import userRoutes from "./routes/user.routes.js";
import userProfileRoutes from "./routes/userProfile.routes.js";
import videoSessionRoutes, {
  adminVideoSessionRoutes
} from "./routes/videoSession.routes.js";
import contactsRoutes from "./routes/contacts.routes.js";

export const app = express();

// Rate limiters guard the brute-forceable (auth) and costly (AI/LLM) surfaces.
// Enforced in production only, so local dev and the test suite are unaffected.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProduction
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProduction
});

app.use(
  helmet({
    // This API serves JSON to a separate SPA origin: a page-level CSP is not
    // meaningful, and responses must stay readable cross-origin.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  cors({
    origin: config.clientUrls,
    credentials: true
  })
);

app.set("trust proxy", 1);

app.use(parseCookies);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
// Redact one-time `token` query params (held-transfer confirm/cancel links) from
// access logs so they can't be replayed from logs.
morgan.token("url", (req) => {
  const raw = (req as { originalUrl?: string; url?: string }).originalUrl ?? (req as { url?: string }).url ?? "";
  return raw.replace(/([?&]token=)[^&]+/gi, "$1[REDACTED]");
});
app.use(morgan("dev"));

// Dev latency simulator: see middleware/devThrottle.ts. Hard-disabled in
// production and warns loudly at boot when active, so a leftover env value
// can never silently slow every request again.
const throttleMs = resolveDevThrottleMs({
  VIRLY_THROTTLE_MS: process.env.VIRLY_THROTTLE_MS,
  NODE_ENV: process.env.NODE_ENV
});
if (throttleMs > 0) {
  warnDevThrottleActive(throttleMs);
  app.use(devThrottleMiddleware(throttleMs));
}

app.get("/", (_req, res) => {
  return res.json({ name: "Virly API", status: "ok" });
});
app.get("/api/health", (_req, res) => {
  return res.json({ status: "ok" });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/accounts", userRoutes);
app.use("/api/accounts", communicationProfileRoutes);
app.use("/api/users", userProfileRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/exchange-rates", exchangeRateRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/video-sessions", videoSessionRoutes);
app.use("/api/admin/video-sessions", adminVideoSessionRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found." });
});
app.use(errorHandler);
