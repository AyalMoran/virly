import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function createToken(userId: string) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "7d" });
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
