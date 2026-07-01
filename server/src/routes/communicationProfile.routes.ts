import { Router } from "express";
import type { ZodError } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { communicationProfileService } from "../services/communicationProfile.service.js";
import {
  communicationProfileUserInputSchema,
  emptyCommunicationProfile,
} from "../domain/communicationProfile.js";

const router = Router();

router.get("/communication-profile", requireAuth, async (req, res, next) => {
  try {
    const profile =
      (await communicationProfileService.getForUser(req.userId!)) ??
      emptyCommunicationProfile();
    res.json({ communicationProfile: profile });
  } catch (error) {
    next(error);
  }
});

router.put("/communication-profile", requireAuth, async (req, res, next) => {
  try {
    const result = communicationProfileUserInputSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid input.", errors: (result.error as ZodError).errors });
      return;
    }
    const profile = await communicationProfileService.updateFromUser(
      req.userId!,
      result.data,
      new Date(),
    );
    res.json({ communicationProfile: profile });
  } catch (error) {
    next(error);
  }
});

router.post("/communication-profile/reset", requireAuth, async (req, res, next) => {
  try {
    await communicationProfileService.reset(req.userId!);
    res.json({ communicationProfile: emptyCommunicationProfile() });
  } catch (error) {
    next(error);
  }
});

export default router;
