import type { PublicUserRecord, TransactionRecord, UserRecord } from "../repositories/types.js";

// Accepts either a TransactionRecord (id field) or a legacy Mongoose-Document
// shape (_id field) so callers that haven't migrated yet still type-check.
type TransactionDocument = {
  id?: string;
  _id?: unknown;
  amount: number;
  type: string;
  reason?: string | null;
  createdAt?: Date;
};

export type PublicUserProfileDto = {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  memberSince?: string;
};

export type RelationshipStatus =
  | "self"
  | "no_history"
  | "has_history"
  | "verified_recipient";

export type UserRelationshipSummaryDto = {
  viewerUserId: string;
  viewedUserId: string;
  totalSentToUser: number;
  totalReceivedFromUser: number;
  netAmount: number;
  transactionCount: number;
  lastTransactionAt: string | null;
  isVerifiedRecipient: boolean;
  canTransferToUser: boolean;
  relationshipStatus: RelationshipStatus;
};

export type UserRelationshipTransactionDto = {
  id: string;
  amount: number;
  direction: "sent" | "received";
  status: "completed";
  createdAt?: string;
  description?: string;
};

export function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function deriveDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const derived = localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

  return derived || "Virly user";
}

export function toPublicUserProfileDto(
  user: UserRecord | PublicUserRecord,
  personalName?: { firstName?: string | null; lastName?: string | null } | null
): PublicUserProfileDto {
  const fullName = [personalName?.firstName, personalName?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: user.id,
    email: user.email,
    displayName: fullName || deriveDisplayNameFromEmail(user.email),
    isVerified: Boolean(user.isVerified),
    memberSince: user.createdAt?.toISOString()
  };
}

export function toRelationshipTransactionDto(
  transaction: TransactionDocument
): UserRelationshipTransactionDto {
  const id =
    "id" in transaction && transaction.id !== undefined
      ? String(transaction.id)
      : String((transaction as { _id: unknown })._id);

  return {
    id,
    amount: transaction.amount,
    direction: transaction.type === "debit" ? "sent" : "received",
    status: "completed",
    createdAt: transaction.createdAt?.toISOString(),
    description: transaction.reason ?? undefined
  };
}

export function resolveRelationshipStatus(input: {
  isSelf: boolean;
  transactionCount: number;
  isVerifiedRecipient: boolean;
}): RelationshipStatus {
  if (input.isSelf) {
    return "self";
  }

  if (input.transactionCount === 0) {
    return "no_history";
  }

  return input.isVerifiedRecipient ? "verified_recipient" : "has_history";
}
