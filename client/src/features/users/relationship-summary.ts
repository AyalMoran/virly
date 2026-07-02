// client/src/features/users/relationship-summary.ts
import type { UserProfileResponse } from "../../lib/types";

export type RelationshipDisplay = {
  name: string;
  netLabel: "Net sent" | "Net received" | "Even";
  netAmount: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  lastInteraction: string | null;
  verified: boolean;
};

export function summarizeRelationship(profile: UserProfileResponse): RelationshipDisplay {
  const r = profile.relationship;
  const netLabel = r.netAmount > 0 ? "Net sent" : r.netAmount < 0 ? "Net received" : "Even";
  return {
    name: profile.user.displayName?.trim() || profile.user.email,
    netLabel,
    netAmount: Math.abs(r.netAmount),
    totalSent: r.totalSentToUser,
    totalReceived: r.totalReceivedFromUser,
    transactionCount: r.transactionCount,
    lastInteraction: r.lastTransactionAt,
    verified: r.isVerifiedRecipient
  };
}
