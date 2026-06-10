import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyRelationshipState } from "../src/features/users/EmptyRelationshipState";
import { RecentRelationshipTransactions } from "../src/features/users/RecentRelationshipTransactions";
import { RecipientStatusCard } from "../src/features/users/RecipientStatusCard";
import { RelationshipSummaryCard } from "../src/features/users/RelationshipSummaryCard";
import { UserProfileHeader } from "../src/features/users/UserProfileHeader";
import type {
  RelationshipTransaction,
  UserRelationshipSummary
} from "../src/lib/types";

const relationship: UserRelationshipSummary = {
  viewerUserId: "viewer-1",
  viewedUserId: "viewed-1",
  totalSentToUser: 1240,
  totalReceivedFromUser: 450,
  netAmount: 790,
  transactionCount: 8,
  lastTransactionAt: "2026-06-03T12:00:00.000Z",
  isVerifiedRecipient: true,
  canTransferToUser: true,
  relationshipStatus: "verified_recipient"
};

const transactions: RelationshipTransaction[] = [
  {
    id: "tx-1",
    amount: 120,
    direction: "sent",
    status: "completed",
    createdAt: "2026-06-03T12:00:00.000Z",
    description: "Lunch"
  },
  {
    id: "tx-2",
    amount: 80.5,
    direction: "received",
    status: "completed",
    createdAt: "2026-06-01T09:00:00.000Z"
  }
];

test("profile header shows identity, verification badge, and send action", () => {
  const html = renderToStaticMarkup(
    <UserProfileHeader
      user={{
        id: "viewed-1",
        email: "daniel@example.com",
        displayName: "Daniel Cohen",
        isVerified: true,
        memberSince: "2026-03-10T00:00:00.000Z"
      }}
      isSelf={false}
      canSendMoney
      onSendMoney={() => {}}
    />
  );

  assert.match(html, /Daniel Cohen/);
  assert.match(html, /daniel@example\.com/);
  assert.match(html, /Verified/);
  assert.match(html, /Member since March 2026/);
  assert.match(html, /Send money/);
});

test("relationship summary renders viewer-relative totals", () => {
  const html = renderToStaticMarkup(
    <RelationshipSummaryCard relationship={relationship} viewedName="Daniel" />
  );

  assert.match(html, /Between you and Daniel/);
  assert.match(html, /You sent/);
  assert.match(html, /You received/);
  assert.match(html, /Net sent/);
  assert.match(html, /1,240/);
  assert.match(html, /450/);
  assert.match(html, /790/);
  assert.match(html, />8</);
});

test("shared transactions render direction relative to the viewer", () => {
  const html = renderToStaticMarkup(
    <RecentRelationshipTransactions
      idOrEmail="daniel@example.com"
      initialTransactions={transactions}
      totalCount={2}
      viewedName="Daniel"
    />
  );

  assert.match(html, /Sent to Daniel/);
  assert.match(html, /Received from Daniel/);
  assert.match(html, /Lunch/);
  assert.match(html, /Completed/);
  assert.match(html, /amount-debit/);
  assert.match(html, /amount-credit/);
});

test("recipient status renders verified copy with transfer action", () => {
  const html = renderToStaticMarkup(
    <RecipientStatusCard
      relationship={relationship}
      viewedName="Daniel"
      onSendMoney={() => {}}
    />
  );

  assert.match(html, /Verified recipient/);
  assert.match(html, /Send money/);
});

test("recipient status for self profile hides the transfer action", () => {
  const html = renderToStaticMarkup(
    <RecipientStatusCard
      relationship={{
        ...relationship,
        canTransferToUser: false,
        relationshipStatus: "self"
      }}
      viewedName="Daniel"
      onSendMoney={() => {}}
    />
  );

  assert.match(html, /Your account/);
  assert.doesNotMatch(html, /Send money/);
});

test("empty relationship state offers a safe send-money entry point", () => {
  const html = renderToStaticMarkup(
    <EmptyRelationshipState viewedName="Daniel" canSendMoney onSendMoney={() => {}} />
  );

  assert.match(html, /You and Daniel have no transactions yet/);
  assert.match(html, /Send money/);
});
