import { getRepositories } from "../repositories/index.js";
import type { PublicUserRecord, UserRecord } from "../repositories/types.js";
import { AppError } from "../utils/app-error.js";

export type { UserRecord };

export const accountService = {
  async getById(userId: string): Promise<PublicUserRecord> {
    const user = await getRepositories().users.findByIdSafe(userId);
    if (!user) throw new AppError(404, "Account not found.");
    return user;
  },
  findById: (id: string) => getRepositories().users.findById(id),
  findByEmail: (email: string) => getRepositories().users.findByEmail(email),
  async findByIdOrEmail(identifier: string): Promise<UserRecord | null> {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (objectIdPattern.test(identifier)) return getRepositories().users.findById(identifier);
    const email = identifier.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
    return getRepositories().users.findByEmail(email);
  },
  create: (input: { email: string; passwordHash: string; phone: string; balance: number }) =>
    getRepositories().users.create(input)
};
