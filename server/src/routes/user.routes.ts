import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { accountService } from "../services/account.service.js";
import { personalDetailsService } from "../services/personalDetails.service.js";
import { transactionQueryService } from "../services/transactionQuery.service.js";
import { toPersonalDetailsDto } from "../utils/personal-details.js";
import { getPaginationMeta, parsePagination } from "../utils/pagination.js";
import { toTransactionDto } from "../utils/transaction-dto.js";

const router = Router();

//#region Schemas
const nameSchema = z.string().trim().min(1).max(100);
const addressFieldSchema = z.string().trim().min(1).max(120);
const optionalAddressFieldSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .nullable()
  .transform((value) => value || null);

const personalDetailsSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  dateOfBirth: z.string().refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.getTime() < Date.now();
  }, "Date of birth must be a valid past date."),
  address: z.object({
    country: addressFieldSchema,
    stateRegion: optionalAddressFieldSchema,
    city: addressFieldSchema,
    street: addressFieldSchema,
    addressLine2: optionalAddressFieldSchema,
    postalCode: addressFieldSchema
  })
});
//#endregion

//#region Routes
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);

    const user = await accountService.getById(req.userId!);

    const personalDetails = await personalDetailsService.ensureForUser(user);

    const { transactions, total } = await transactionQueryService.listForOwner({
      ownerId: user.id,
      page,
      limit
    });

    return res.json({
      balance: user.balance,
      personalDetails: {
        id: personalDetails.id,
        status: personalDetails.status,
        firstName: personalDetails.firstName,
        needsPersonalDetails: personalDetails.status !== "provided"
      },
      transactions: transactions.map(toTransactionDto),
      pagination: getPaginationMeta(page, limit, total)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/personal-details", requireAuth, async (req, res, next) => {
  try {
    const user = await accountService.getById(req.userId!);
    const personalDetails = await personalDetailsService.ensureForUser(user);
    return res.json({ personalDetails: toPersonalDetailsDto(personalDetails) });
  } catch (error) {
    next(error);
  }
});

router.put("/personal-details", requireAuth, async (req, res, next) => {
  try {
    const payload = personalDetailsSchema.parse(req.body);
    // Ensure the doc exists first so a PUT before any GET still creates-then-
    // updates (the pre-service behavior) rather than 404-ing.
    const user = await accountService.getById(req.userId!);
    await personalDetailsService.ensureForUser(user);
    const personalDetails = await personalDetailsService.update(req.userId!, payload);
    return res.json({ personalDetails: toPersonalDetailsDto(personalDetails) });
  } catch (error) {
    next(error);
  }
});

router.post("/personal-details/skip", requireAuth, async (req, res, next) => {
  try {
    // Ensure the doc exists first so skip works before any GET (pre-service
    // behavior) rather than 404-ing.
    const user = await accountService.getById(req.userId!);
    await personalDetailsService.ensureForUser(user);
    const personalDetails = await personalDetailsService.markSkipped(req.userId!);
    return res.json({
      message: "Personal details skipped.",
      personalDetails: toPersonalDetailsDto(personalDetails)
    });
  } catch (error) {
    next(error);
  }
});
//#endregion

export default router;
