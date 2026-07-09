// server/src/services/contacts.service.ts
import { getRepositories } from "../repositories/index.js";
import { AppError } from "../utils/app-error.js";
import type { ContactRecord } from "../repositories/types.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const contactsService = {
  async addContact(input: {
    ownerId: string;
    email: string;
    displayName?: string | null;
  }): Promise<ContactRecord> {
    const repos = getRepositories();
    const email = normalizeEmail(input.email);

    const target = await repos.users.findByEmail(email);
    if (!target) {
      throw new AppError(404, "No Virly user exists with that email.");
    }

    const owner = await repos.users.findByIdSafe(input.ownerId);
    if (owner && owner.email.toLowerCase() === email) {
      throw new AppError(400, "You cannot save yourself as a contact.");
    }

    return repos.contacts.upsertForOwner({
      ownerId: input.ownerId,
      email,
      displayName: input.displayName?.trim() || null
    });
  },

  async listContacts(ownerId: string): Promise<ContactRecord[]> {
    return getRepositories().contacts.listForOwner(ownerId);
  },

  async removeContact(input: { ownerId: string; id: string }): Promise<void> {
    const deleted = await getRepositories().contacts.deleteForOwner(input);
    if (!deleted) {
      throw new AppError(404, "Contact not found.");
    }
  }
};
