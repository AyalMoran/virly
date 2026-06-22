import { User } from "../../models/User.js";
import { asSession } from "./transaction.js";
import {
  DuplicateKeyError,
  type PublicUserRecord,
  type UserRecord,
  type UserRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): UserRecord {
  return {
    id: String(d._id),
    email: d.email as string,
    passwordHash: d.passwordHash as string,
    phone: d.phone as string,
    isVerified: Boolean(d.isVerified),
    personalDetails: d.personalDetails ? String(d.personalDetails) : null,
    verificationTokenHash: (d.verificationTokenHash as string | null) ?? null,
    verificationTokenExpiresAt: (d.verificationTokenExpiresAt as Date | null) ?? null,
    balance: d.balance as number,
    role: d.role as UserRecord["role"],
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

function isDup(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { code?: number }).code === 11000);
}

export const mongoUserRepository: UserRepository = {
  async findById(id, tx) {
    const q = User.findById(id);
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },
  async findByIdSafe(id, tx) {
    const rec = await this.findById(id, tx);
    if (!rec) return null;
    const { passwordHash, verificationTokenHash, ...safe } = rec;
    return safe as PublicUserRecord;
  },
  async findByEmail(email, tx) {
    const q = User.findOne({ email: email.trim().toLowerCase() });
    const s = asSession(tx);
    if (s) q.session(s);
    const d = await q.lean();
    return d ? toRecord(d as Lean) : null;
  },
  async create(input, tx) {
    try {
      const [doc] = await User.create([{ ...input, balance: input.balance }], { session: asSession(tx) });
      return toRecord(doc.toObject() as Lean);
    } catch (e) {
      if (isDup(e)) throw new DuplicateKeyError("email");
      throw e;
    }
  },
  async setBalance(id, balance, tx) {
    await User.updateOne({ _id: id }, { $set: { balance } }, { session: asSession(tx) });
  },
  async setVerificationToken(id, hash, expiresAt, tx) {
    await User.updateOne(
      { _id: id },
      { $set: { verificationTokenHash: hash, verificationTokenExpiresAt: expiresAt } },
      { session: asSession(tx) }
    );
  },
  async markVerified(id, tx) {
    await User.updateOne(
      { _id: id },
      { $set: { isVerified: true, verificationTokenHash: null, verificationTokenExpiresAt: null } },
      { session: asSession(tx) }
    );
  },
  async setPersonalDetails(id, personalDetailsId, tx) {
    await User.updateOne(
      { _id: id },
      { $set: { personalDetails: personalDetailsId } },
      { session: asSession(tx) }
    );
  }
};
