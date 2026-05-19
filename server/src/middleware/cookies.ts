import { NextFunction, Request, Response } from "express";

function parseCookieHeader(header: string | undefined) {
  const cookies: Record<string, string> = {};

  if (!header) {
    return cookies;
  }

  for (const cookie of header.split(";")) {
    const [rawName, ...rawValueParts] = cookie.split("=");
    const name = rawName.trim();
    const value = rawValueParts.join("=").trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

export function parseCookies(req: Request, _res: Response, next: NextFunction) {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}
