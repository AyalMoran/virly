// src/repositories/mongo/contact.repository.ts
import { Contact } from "../../models/Contact.js";
import type { ContactRecord, ContactRepository, TxContext } from "../types.js";
import { asSession } from "./transaction.js";

function toContactRecord(d: Record<string, unknown>): ContactRecord {
  return {
    id: String(d._id),
    ownerId: String(d.ownerId),
    email: d.email as string,
    displayName: (d.displayName as string | null) ?? null,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoContactRepository: ContactRepository = {
  async upsertForOwner({ ownerId, email, displayName }, tx?: TxContext) {
    const doc = await Contact.findOneAndUpdate(
      { ownerId, email: email.toLowerCase() },
      { $setOnInsert: { displayName: displayName ?? null } },
      { upsert: true, new: true, session: asSession(tx) }
    ).lean();
    if (!doc) throw new Error("upsertForOwner: findOneAndUpdate returned null unexpectedly");
    return toContactRecord(doc as Record<string, unknown>);
  },

  async listForOwner(ownerId, tx?: TxContext) {
    const docs = await Contact.find({ ownerId }, null, { session: asSession(tx) })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return docs.map((d) => toContactRecord(d as Record<string, unknown>));
  },

  async deleteForOwner({ ownerId, id }, tx?: TxContext) {
    const res = await Contact.deleteOne({ _id: id, ownerId }, { session: asSession(tx) });
    return (res.deletedCount ?? 0) > 0;
  }
};
