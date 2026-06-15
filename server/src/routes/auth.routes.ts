import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { sendVerificationEmail } from "../services/email.service.js";
import { createVerificationToken, verifyVerificationToken } from "../utils/auth.js";
import { randomStartingBalance } from "../utils/otp.js";
import { ensurePersonalDetails, toAuthUserDto } from "../utils/personal-details.js";
import { clearAuthCookies, setAuthCookies } from "../utils/session.js";
import { hashToken, verificationTokenExpiry } from "../utils/token.js";
import { requireAuth } from "../middleware/auth.js";

//#region Type Definitions

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, "Phone number must contain 9-15 digits.")
});

const verifyQuerySchema = z.object({
  token: z.string().min(1, "Verification token is required.")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false)
});

const resendVerificationSchema = z.object({
  email: z.string().email()
});

const resendVerificationMessage =
  "If this email is registered and unverified, a new verification link was sent.";
//#endregion

//#region  Helper Functions
async function sendNewVerificationLink(user: InstanceType<typeof User>) {
  const verificationToken = createVerificationToken(user.id);
  user.verificationTokenHash = hashToken(verificationToken);
  user.verificationTokenExpiresAt = verificationTokenExpiry();
  await user.save();

  const verificationUrl = `${config.serverUrl}/api/auth/verify?token=${encodeURIComponent(
    verificationToken
  )}`;
  await sendVerificationEmail(user.email, verificationUrl);
}

async function createAuthResponse(user: InstanceType<typeof User>, csrfToken?: string) {
  const personalDetails = await ensurePersonalDetails(user);

  return {
    user: toAuthUserDto(user, personalDetails),
    ...(csrfToken ? { csrfToken } : {})
  };
}
//#endregion

//#region Routes
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, phone } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      phone,
      balance: 0
    });
    await ensurePersonalDetails(user);

    await sendNewVerificationLink(user);

    return res.status(201).json({
      message: `Verification email sent to ${user.email}`
    });
  } catch (error) {
    next(error);
  }
});

router.get("/verify", async (req, res, next) => {
  try {
    const { token: verificationToken } = verifyQuerySchema.parse(req.query);
    let userId: string;

    try {
      userId = verifyVerificationToken(verificationToken).userId;
    } catch {
      return res.status(400).json({ message: "Verification token is invalid or expired." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isVerified) {
      const csrfToken = setAuthCookies(res, user.id, { rememberMe: false });
      return res.json(await createAuthResponse(user, csrfToken));
    }

    const isExpired =
      !user.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt.getTime() < Date.now();
    const isMatch = user.verificationTokenHash === hashToken(verificationToken);

    if (isExpired || !isMatch) {
      return res
        .status(400)
        .json({ message: "Verification token is invalid or expired." });
    }

    user.isVerified = true;
    user.verificationTokenHash = null;
    user.verificationTokenExpiresAt = null;
    await user.save();

    const csrfToken = setAuthCookies(res, user.id, { rememberMe: false });
    return res.json(await createAuthResponse(user, csrfToken));
  } catch (error) {
    next(error);
  }
});

router.post("/resend-verification", async (req, res, next) => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && !user.isVerified) {
      await sendNewVerificationLink(user);
    }

    return res.json({
      message: resendVerificationMessage
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: "Verify your email before logging in." });
    }

    const csrfToken = setAuthCookies(res, user.id, { rememberMe });
    return res.json(await createAuthResponse(user, csrfToken));
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json(await createAuthResponse(user, req.csrfToken));
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  clearAuthCookies(res);
  return res.json({ message: "Logged out." });
});
//#endregion

export default router;
