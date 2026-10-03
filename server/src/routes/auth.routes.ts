import { Router } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";
import { accountService } from "../services/account.service.js";
import { personalDetailsService } from "../services/personalDetails.service.js";
import { toAuthUserDto } from "../utils/personal-details.js";
import { clearAuthCookies, setAuthCookies } from "../utils/session.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveRequestOrigin } from "../geo/request.js";
import { recordActivityEventSafe } from "../services/activityEvent.service.js";
import { evaluateLoginAlert } from "../services/loginAlert.js";
import { getRepositories } from "../repositories/index.js";
import type { ActivityEventRecord } from "../repositories/types.js";
import { getRealtime } from "../realtime/registry.js";

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

  const personalDetails = await personalDetailsService.ensureForUser(user);

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

    const origin = resolveRequestOrigin(req);
    // Best-effort, non-blocking: history is read BEFORE the new event is
    // written so this login is never compared against itself. Deviation from
    // the spec's "other active sessions": the emit goes to the whole user
    // room, because at HTTP-login time there is no socket identity to
    // exclude - the just-logged-in tab hasn't connected its socket yet when
    // the emit fires, so in practice only other sessions see it.
    void (async () => {
      // The history read only feeds the alert heuristic; if it fails we still
      // MUST write the event (spec: events are always written), so degrade to
      // an empty history rather than skipping capture.
      let history: ActivityEventRecord[] = [];
      try {
        history = await getRepositories().activityEvents.listRecentByUser(user.id, { limit: 100 });
      } catch (error) {
        console.error("login alert: activity history read failed", error);
      }
      const at = new Date();
      await recordActivityEventSafe({ userId: user.id, kind: "login", origin, now: at });
      const reasons = evaluateLoginAlert({ geo: origin.geo, at }, history);
      if (reasons.length > 0) {
        getRealtime().emitToUser(user.id, "security:new-login", {
          city: origin.geo?.city ?? null,
          country: origin.geo?.country ?? null,
          at: at.toISOString(),
          reasons
        });
      }
    })().catch((error) => console.error("login alert failed", error));

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
