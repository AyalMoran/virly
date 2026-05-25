import crypto from "node:crypto";
import { Response } from "express";
import { config } from "../config.js";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  PERSISTENT_SESSION_MAX_AGE_MS,
  createToken
} from "./auth.js";
import { hashToken } from "./token.js";

type AuthCookieOptions = {
  rememberMe?: boolean;
};

const baseCookieOptions = {
  secure: true,
  sameSite: config.cookies.sameSite,
  path: "/"
};

export function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCsrfToken(token: string) {
  return hashToken(token);
}

function getCookieOptions({ rememberMe = false }: AuthCookieOptions) {
  return rememberMe
    ? { ...baseCookieOptions, maxAge: PERSISTENT_SESSION_MAX_AGE_MS }
    : baseCookieOptions;
}

export function setAuthCookies(
  res: Response,
  userId: string,
  options: AuthCookieOptions = {}
) {
  const csrfToken = createCsrfToken();
  const authToken = createToken(userId, hashCsrfToken(csrfToken), options);
  const cookieOptions = getCookieOptions(options);

  res.cookie(AUTH_COOKIE_NAME, authToken, {
    ...cookieOptions,
    httpOnly: true
  });
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...cookieOptions,
    httpOnly: false
  });
}

export function clearAuthCookies(res: Response) {
  const clearOptions = {
    secure: baseCookieOptions.secure,
    sameSite: baseCookieOptions.sameSite,
    path: baseCookieOptions.path
  };

  res.clearCookie(AUTH_COOKIE_NAME, {
    ...clearOptions,
    httpOnly: true
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...clearOptions,
    httpOnly: false
  });
}
