import { z } from "zod";
import { User } from "../models/User.js";
import { AppError } from "../utils/app-error.js";

export type UserDocument = InstanceType<typeof User>;

const SECRET_FIELDS = "-passwordHash -verificationTokenHash";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const emailSchema = z.string().email();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const accountService = {
  /**
   * Load a user by id, omitting secret fields from the projection.
   * The result is typed UserDocument, but passwordHash and
   * verificationTokenHash are undefined at runtime — callers must not rely on
   * them. Throws AppError(404) if the user does not exist.
   */
  async getById(userId: string): Promise<UserDocument> {
    const user = await User.findById(userId).select(SECRET_FIELDS);
    if (!user) {
      throw new AppError(404, "Account not found.");
    }
    return user;
  },

  /**
   * Load a user by id without any projection override.
   * Returns null if not found; does not throw.
   */
  async findById(userId: string): Promise<UserDocument | null> {
    return User.findById(userId);
  },

  /**
   * Find a user by email, normalizing (trim + lowercase) before querying.
   * Returns null if not found.
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return User.findOne({ email: normalizeEmail(email) });
  },

  /**
   * Resolve a path parameter that may be a Mongo ObjectId OR an email.
   * An ObjectId (24-hex) is looked up by id; otherwise the value is treated
   * as an email. Returns null if the identifier is invalid or no user is found.
   *
   * Replaces the route-local findViewedUser helper in userProfile.routes.ts.
   */
  async findByIdOrEmail(identifier: string): Promise<UserDocument | null> {
    if (objectIdPattern.test(identifier)) {
      return User.findById(identifier);
    }

    const parsed = emailSchema.safeParse(normalizeEmail(identifier));
    if (!parsed.success) {
      return null;
    }

    return User.findOne({ email: parsed.data });
  },

  /**
   * Create a new user document and return it.
   */
  async create(input: {
    email: string;
    passwordHash: string;
    phone: string;
    balance: number;
  }): Promise<UserDocument> {
    return User.create(input);
  }
};
