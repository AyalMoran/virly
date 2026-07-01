// src/repositories/postgres/communicationProfile.repository.ts

import { eq } from "drizzle-orm";
import { communicationProfiles } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type { CommunicationProfileRecord, CommunicationProfileRepository } from "../types.js";

function toRecord(r: typeof communicationProfiles.$inferSelect): CommunicationProfileRecord {
  return {
    id: r.id, userId: r.userId,
    formality: (r.formality as CommunicationProfileRecord["formality"]) ?? null,
    verbosity: (r.verbosity as CommunicationProfileRecord["verbosity"]) ?? null,
    complexity: (r.complexity as CommunicationProfileRecord["complexity"]) ?? null,
    humor: (r.humor as CommunicationProfileRecord["humor"]) ?? null,
    pace: (r.pace as CommunicationProfileRecord["pace"]) ?? null,
    memory: r.memory ?? "",
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export const postgresCommunicationProfileRepository: CommunicationProfileRepository = {
  async findByUserId(userId, tx) {
    const [r] = await asPgTx(tx).select().from(communicationProfiles).where(eq(communicationProfiles.userId, userId)).limit(1);
    return r ? toRecord(r) : null;
  },
  async save(userId, profile, tx) {
    const values = { ...profile, userId, updatedAt: new Date() };
    const [r] = await asPgTx(tx)
      .insert(communicationProfiles)
      .values({ id: newObjectId(), ...values })
      .onConflictDoUpdate({ target: communicationProfiles.userId, set: values })
      .returning();
    return toRecord(r);
  },
  async deleteByUserId(userId, tx) {
    await asPgTx(tx).delete(communicationProfiles).where(eq(communicationProfiles.userId, userId));
  },
};
