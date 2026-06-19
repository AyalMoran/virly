import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { accountService } from "../services/account.service.js";
import { transactionQueryService } from "../services/transactionQuery.service.js";
import {
  ensurePersonalDetails,
  toPersonalDetailsDto
} from "../utils/personal-details.js";
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

    const personalDetails = await ensurePersonalDetails(user);

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
    const personalDetails = await ensurePersonalDetails(user);
    return res.json({ personalDetails: toPersonalDetailsDto(personalDetails) });
  } catch (error) {
    next(error);
  }
});

router.put("/personal-details", requireAuth, async (req, res, next) => {
  try {
    const payload = personalDetailsSchema.parse(req.body);
    const user = await accountService.getById(req.userId!);
    const personalDetails = await ensurePersonalDetails(user);
    personalDetails.status = "provided";
    personalDetails.firstName = payload.firstName;
    personalDetails.lastName = payload.lastName;
    personalDetails.dateOfBirth = new Date(payload.dateOfBirth);
    personalDetails.address = payload.address;

    await personalDetails.save();

    return res.json({ personalDetails: toPersonalDetailsDto(personalDetails) });
  } catch (error) {
    next(error);
  }
});

router.post("/personal-details/skip", requireAuth, async (req, res, next) => {
  try {
    const user = await accountService.getById(req.userId!);
    const personalDetails = await ensurePersonalDetails(user);
    personalDetails.lastSkippedAt = new Date();
    await personalDetails.save();

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
