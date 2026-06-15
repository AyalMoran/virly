import crypto from "crypto";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verificationTokenExpiry() {
  return new Date(Date.now() + 10 * 60 * 1000);
}
