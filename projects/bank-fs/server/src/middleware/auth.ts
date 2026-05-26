import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from "../utils/auth.js";
import { hashCsrfToken } from "../utils/session.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!payload.userId) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    const csrfCookieToken = req.cookies[CSRF_COOKIE_NAME];
    if (
      csrfCookieToken &&
      typeof payload.csrfTokenHash === "string" &&
      hashCsrfToken(csrfCookieToken) === payload.csrfTokenHash
    ) {
      req.csrfToken = csrfCookieToken;
    }

    if (unsafeMethods.has(req.method)) {
      const csrfToken = getHeaderValue(req.headers["x-csrf-token"]);
      if (
        !csrfToken ||
        typeof payload.csrfTokenHash !== "string" ||
        hashCsrfToken(csrfToken) !== payload.csrfTokenHash
      ) {
        return res.status(403).json({ message: "Invalid CSRF token." });
      }
    }

    req.userId = String(payload.userId);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}
