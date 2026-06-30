/**
 * Counterparty profile + relationship fixtures (rendered under "Shared UI").
 */
import type {
  PublicUserProfile,
  RelationshipTransaction,
  UserProfileResponse,
  UserRelationshipSummary,
  UserRelationshipTransactionsResponse,
} from "@/lib/types";
import { paginationFixture } from "./transactions";

export const publicUserFixture: PublicUserProfile = {
  id: "usr_test_0002",
  email: "maya.cohen@virly.test",
  displayName: "Maya Cohen",
  isVerified: true,
  memberSince: "2025-03-01T00:00:00.000Z",
};

export const relationshipFixture: UserRelationshipSummary = {
  viewerUserId: "usr_test_0001",
  viewedUserId: "usr_test_0002",
  totalSentToUser: 1450,
  totalReceivedFromUser: 300,
  netAmount: 1150,
  transactionCount: 7,
  lastTransactionAt: "2026-06-20T18:30:00.000Z",
  isVerifiedRecipient: true,
  canTransferToUser: true,
  relationshipStatus: "verified_recipient",
};

/** No shared history yet — drives the empty-relationship branch. */
export const emptyRelationshipFixture: UserRelationshipSummary = {
  viewerUserId: "usr_test_0001",
  viewedUserId: "usr_test_0003",
  totalSentToUser: 0,
  totalReceivedFromUser: 0,
  netAmount: 0,
  transactionCount: 0,
  lastTransactionAt: null,
  isVerifiedRecipient: false,
  canTransferToUser: true,
  relationshipStatus: "no_history",
};

export const relationshipTransactionsFixture: RelationshipTransaction[] = [
  {
    id: "rtx_0001",
    amount: 250,
    direction: "sent",
    status: "completed",
    createdAt: "2026-06-20T18:30:00.000Z",
    description: "Dinner split",
  },
  {
    id: "rtx_0002",
    amount: 300,
    direction: "received",
    status: "completed",
    createdAt: "2026-06-16T11:00:00.000Z",
    description: "Shared rent refund",
  },
];

export const userProfileFixture: UserProfileResponse = {
  user: publicUserFixture,
  relationship: relationshipFixture,
  recentTransactions: relationshipTransactionsFixture,
};

export const relationshipTransactionsResponseFixture: UserRelationshipTransactionsResponse =
  {
    transactions: relationshipTransactionsFixture,
    pagination: paginationFixture,
  };
