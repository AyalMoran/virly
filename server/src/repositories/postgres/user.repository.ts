
import { eq, inArray } from "drizzle-orm";
import { users } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId, isObjectIdHex } from "./id.js";
import { mapPgError } from "./errors.js";
import type { PublicUserRecord, TxContext, UserRecord, UserRepository } from "../types.js";

type Row = typeof users.$inferSelect;

function toRecord(r: Row): UserRecord {
  return {
    id: r.id, email: r.email, passwordHash: r.passwordHash, phone: r.phone,
    isVerified: r.isVerified, personalDetails: r.personalDetails,
    verificationTokenHash: r.verificationTokenHash,
    verificationTokenExpiresAt: r.verificationTokenExpiresAt,
    balance: r.balance, role: r.role as UserRecord["role"],
    createdAt: r.createdAt, updatedAt: r.updatedAt
  };
}

export const postgresUserRepository: UserRepository = {
  async findById(id, tx) {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx).select().from(users).where(eq(users.id, id)).limit(1);
    return r ? toRecord(r) : null;
  },
  async findByIdSafe(id, tx) {
    const rec = await this.findById(id, tx);
    if (!rec) return null;
    const { passwordHash, verificationTokenHash, ...safe } = rec;
    return safe as PublicUserRecord;
  },
  async findByEmail(email, tx) {
    const [r] = await asPgTx(tx).select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return r ? toRecord(r) : null;
  },
  async findByEmails(emails, tx) {
    if (emails.length === 0) return [];
    const rows = await asPgTx(tx).select().from(users).where(inArray(users.email, emails));
    return rows.map(toRecord);
  },
  async findManyByIds(ids, tx) {
    const valid = ids.filter(isObjectIdHex);
    if (valid.length === 0) return [];
    const rows = await asPgTx(tx).select().from(users).where(inArray(users.id, valid));
    return rows.map(toRecord);
  },
  async create(input, tx) {
    const now = new Date();
    try {
      const [r] = await asPgTx(tx).insert(users).values({
        id: newObjectId(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        phone: input.phone,
        isVerified: false,
        personalDetails: null,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
        balance: input.balance,
        role: "user",
        createdAt: now, updatedAt: now
      }).returning();
      return toRecord(r);
    } catch (e) { mapPgError(e, "email"); }
  },
  async setBalance(id, balance, tx) {
    await asPgTx(tx).update(users).set({ balance, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async setVerificationToken(id, hash, expiresAt, tx) {
    await asPgTx(tx).update(users).set({ verificationTokenHash: hash, verificationTokenExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async markVerified(id, tx) {
    await asPgTx(tx).update(users).set({ isVerified: true, verificationTokenHash: null, verificationTokenExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async setPersonalDetails(id, personalDetailsId, tx) {
    await asPgTx(tx).update(users).set({ personalDetails: personalDetailsId, updatedAt: new Date() }).where(eq(users.id, id));
  }
};
