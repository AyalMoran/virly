import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!payload.userId) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    req.userId = String(payload.userId);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}
