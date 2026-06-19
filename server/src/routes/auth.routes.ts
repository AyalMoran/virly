import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";
import { accountService } from "../services/account.service.js";
import { ensurePersonalDetails, toAuthUserDto } from "../utils/personal-details.js";
import { clearAuthCookies, setAuthCookies } from "../utils/session.js";
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
async function createAuthResponse(
  user: Awaited<ReturnType<typeof accountService.findById>>,
  csrfToken?: string
) {
  if (!user) {
    throw new Error("createAuthResponse requires a user.");
  }

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
    const { user } = await authService.register({ email, password, phone });

    return res.status(201).json({
      message: `Verification email sent to ${user.email}`
    });
  } catch (error) {
    next(error);
  }
});

router.get("/verify", async (req, res, next) => {
  try {
    const { token } = verifyQuerySchema.parse(req.query);
    const { user } = await authService.verifyEmail(token);

    const csrfToken = setAuthCookies(res, user.id, { rememberMe: false });
    return res.json(await createAuthResponse(user, csrfToken));
  } catch (error) {
    next(error);
  }
});

router.post("/resend-verification", async (req, res, next) => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);
    await authService.resendVerification(email);

    return res.json({ message: resendVerificationMessage });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const user = await authService.login({ email, password });

    const csrfToken = setAuthCookies(res, user.id, { rememberMe });
    return res.json(await createAuthResponse(user, csrfToken));
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = req.userId ? await accountService.findById(req.userId) : null;

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
