// server/src/routes/contacts.routes.ts
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { contactsService } from "../services/contacts.service.js";
import type { ContactRecord } from "../repositories/types.js";

const router = Router();
router.use(requireAuth);

const addContactSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  displayName: z.string().trim().max(80).optional()
});

function toDto(record: ContactRecord) {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    createdAt: record.createdAt.toISOString()
  };
}

router.get("/", async (req, res, next) => {
  try {
    const contacts = await contactsService.listContacts(req.userId!);
    return res.json({ contacts: contacts.map(toDto) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = addContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Provide a valid contact email." });
    }
    const contact = await contactsService.addContact({
      ownerId: req.userId!,
      email: parsed.data.email,
      displayName: parsed.data.displayName ?? null
    });
    return res.status(201).json({ contact: toDto(contact) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await contactsService.removeContact({
      ownerId: req.userId!,
      id: req.params.id
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
