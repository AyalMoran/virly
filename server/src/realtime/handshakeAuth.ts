// VERIFIED: there is no verifyAuthToken util; the REST middleware verifies the
// cookie inline. Mirror it here. AUTH_COOKIE_NAME + createToken come from utils/auth.js.
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AUTH_COOKIE_NAME, createToken } from "../utils/auth.js";

// Re-export so the test can import the real cookie name + a signer from one place:
export { AUTH_COOKIE_NAME };

function parseCookies(header: string): Record<string, string> {
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return acc;
  }, {});
}

export function userIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const token = parseCookies(cookieHeader)[AUTH_COOKIE_NAME];
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    const userId = payload.userId;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}

// Test signer: the auth cookie value IS the JWT; mint one the way the app does.
// (Handshake validates only the JWT signature + userId, no CSRF.)
export function signAuthCookieValue(userId: string): string {
  return createToken(userId, "handshake-test-csrf-hash");
}
