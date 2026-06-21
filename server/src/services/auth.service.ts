import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { sendVerificationEmail } from "./email.service.js";
import { accountService, type UserDocument } from "./account.service.js";
import { createVerificationToken, verifyVerificationToken } from "../utils/auth.js";
import { personalDetailsService } from "./personalDetails.service.js";
import { hashToken, verificationTokenExpiry } from "../utils/token.js";
import { AppError } from "../utils/app-error.js";

/**
 * Issue a fresh verification token for the user, persist its hash + expiry, and
 * email the verification link. Moved verbatim from auth.routes.ts so the token
 * hashing/expiry semantics are preserved exactly.
 */
async function sendNewVerificationLink(user: UserDocument): Promise<string> {
  const verificationToken = createVerificationToken(user.id);
  user.verificationTokenHash = hashToken(verificationToken);
  user.verificationTokenExpiresAt = verificationTokenExpiry();
  await user.save();

  const verificationUrl = `${config.serverUrl}/api/auth/verify?token=${encodeURIComponent(
    verificationToken
  )}`;
  await sendVerificationEmail(user.email, verificationUrl);

  return verificationToken;
}

export const authService = {
  /**
   * Register a new account. Rejects a duplicate email with AppError(409),
   * hashes the password, creates the user (starting balance 0), ensures a
   * personal-details record exists, then issues and emails a verification link.
   */
  async register(input: {
    email: string;
    password: string;
    phone: string;
  }): Promise<{ user: UserDocument; verificationToken: string }> {
    const existingUser = await accountService.findByEmail(input.email);
    if (existingUser) {
      throw new AppError(409, "Email is already registered.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await accountService.create({
      email: input.email.toLowerCase(),
      passwordHash,
      phone: input.phone,
      balance: 0
    });
    await personalDetailsService.ensureForUser(user);

    const verificationToken = await sendNewVerificationLink(user);

    return { user, verificationToken };
  },

  /**
   * Validate an email-verification token and flip the account to verified.
   *
   * An already-verified account short-circuits with alreadyVerified=true and
   * no state change. An invalid/expired JWT, an expired stored token, or a hash
   * mismatch all surface as AppError(400) with the same generic message (no
   * distinction is leaked). A missing user is AppError(404).
   */
  async verifyEmail(
    token: string
  ): Promise<{ user: UserDocument; alreadyVerified: boolean }> {
    let userId: string;
    try {
      userId = verifyVerificationToken(token).userId;
    } catch {
      throw new AppError(400, "Verification token is invalid or expired.");
    }

    const user = await accountService.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found.");
    }

    if (user.isVerified) {
      return { user, alreadyVerified: true };
    }

    const isExpired =
      !user.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt.getTime() < Date.now();
    const isMatch = user.verificationTokenHash === hashToken(token);

    if (isExpired || !isMatch) {
      throw new AppError(400, "Verification token is invalid or expired.");
    }

    user.isVerified = true;
    user.verificationTokenHash = null;
    user.verificationTokenExpiresAt = null;
    await user.save();

    return { user, alreadyVerified: false };
  },

  /**
   * Authenticate credentials. An unknown email and a wrong password both fail
   * with AppError(401) and the SAME message so neither is enumerable. A correct
   * password on an unverified account fails with AppError(403). On success the
   * full user document is returned.
   */
  async login(creds: { email: string; password: string }): Promise<UserDocument> {
    const user = await accountService.findByEmail(creds.email);
    if (!user) {
      throw new AppError(401, "Invalid email or password.");
    }

    const isValidPassword = await bcrypt.compare(creds.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError(401, "Invalid email or password.");
    }

    if (!user.isVerified) {
      throw new AppError(403, "Verify your email before logging in.");
    }

    return user;
  },

  /**
   * Re-send a verification link, enumeration-safe: silently no-ops (no email,
   * no throw) when the email is absent or already verified. The route returns
   * the same generic message regardless.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await accountService.findByEmail(email);
    if (user && !user.isVerified) {
      await sendNewVerificationLink(user);
    }
  }
};
