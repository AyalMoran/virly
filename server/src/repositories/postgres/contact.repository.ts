// src/repositories/postgres/contact.repository.ts
import { and, desc, eq } from "drizzle-orm";
import { contacts } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type { ContactRecord, ContactRepository, TxContext } from "../types.js";

type Row = typeof contacts.$inferSelect;

function toRecord(r: Row): ContactRecord {
  return {
    id: r.id,
    ownerId: r.ownerId,
    email: r.email,
    displayName: r.displayName ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresContactRepository: ContactRepository = {
  async upsertForOwner({ ownerId, email, displayName }, tx?: TxContext) {
    const now = new Date();
    const [row] = await asPgTx(tx)
      .insert(contacts)
      .values({
        id: newObjectId(),
        ownerId,
        email: email.toLowerCase(),
        displayName: displayName ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.email],
        set: { updatedAt: now }
      })
      .returning();
    if (!row) {
      throw new Error("upsertForOwner: insert/update returned no row.");
    }
    return toRecord(row);
  },

  async listForOwner(ownerId: string, tx?: TxContext) {
    const rows = await asPgTx(tx)
      .select()
      .from(contacts)
      .where(eq(contacts.ownerId, ownerId))
      .orderBy(desc(contacts.createdAt), desc(contacts.id));
    return rows.map(toRecord);
  },

  async deleteForOwner({ ownerId, id }: { ownerId: string; id: string }, tx?: TxContext) {
    const rows = await asPgTx(tx)
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)))
      .returning({ id: contacts.id });
    return rows.length > 0;
  }
};
