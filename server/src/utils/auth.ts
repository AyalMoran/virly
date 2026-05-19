import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const AUTH_COOKIE_NAME = "virly_auth";
export const CSRF_COOKIE_NAME = "virly_csrf";
export const SESSION_TOKEN_EXPIRES_IN = "7d";
export const PERSISTENT_SESSION_EXPIRES_IN = "30d";
export const PERSISTENT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createToken(
  userId: string,
  csrfTokenHash: string,
  options: { rememberMe?: boolean } = {}
) {
  return jwt.sign(
    { userId, csrfTokenHash },
    config.jwtSecret,
    { expiresIn: options.rememberMe ? PERSISTENT_SESSION_EXPIRES_IN : SESSION_TOKEN_EXPIRES_IN }
  );
}

export function createVerificationToken(userId: string) {
  return jwt.sign(
    {
      sub: userId,
      purpose: "email-verification"
    },
    config.jwtSecret,
    { expiresIn: "10m" }
  );
}

export function verifyVerificationToken(token: string) {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;

  if (payload.purpose !== "email-verification" || !payload.sub) {
    throw new Error("Invalid verification token.");
  }

  return {
    userId: String(payload.sub)
  };
}
