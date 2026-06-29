import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyRelationshipState } from "../../../features/users/EmptyRelationshipState";
import { RecentRelationshipTransactions } from "../../../features/users/RecentRelationshipTransactions";
import { RecipientStatusCard } from "../../../features/users/RecipientStatusCard";
import { RelationshipSummaryCard } from "../../../features/users/RelationshipSummaryCard";
import { UserProfileHeader } from "../../../features/users/UserProfileHeader";
import type {
  RelationshipTransaction,
  UserRelationshipSummary
} from "../../../lib/types";

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

  expect(html).toMatch(/Daniel Cohen/);
  expect(html).toMatch(/daniel@example\.com/);
  expect(html).toMatch(/Verified/);
  expect(html).toMatch(/Member since March 2026/);
  expect(html).toMatch(/Transfer/);
});

test("relationship summary renders viewer-relative totals", () => {
  const html = renderToStaticMarkup(
    <RelationshipSummaryCard relationship={relationship} viewedName="Daniel" />
  );

  expect(html).toMatch(/Between you and Daniel/);
  expect(html).toMatch(/You sent/);
  expect(html).toMatch(/You received/);
  expect(html).toMatch(/Net sent/);
  expect(html).toMatch(/1,240/);
  expect(html).toMatch(/450/);
  expect(html).toMatch(/790/);
  expect(html).toMatch(/>8</);
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

  expect(html).toMatch(/Sent to Daniel/);
  expect(html).toMatch(/Received from Daniel/);
  expect(html).toMatch(/Lunch/);
  expect(html).toMatch(/Completed/);
  expect(html).toMatch(/amount-debit/);
  expect(html).toMatch(/amount-credit/);
  // Rows open the shared transaction details dialog, so they expose button semantics.
  expect(html).toMatch(/transaction-row selectable/);
  expect(html).toMatch(/role="button"/);
});

test("recipient status renders verified copy with transfer action", () => {
  const html = renderToStaticMarkup(
    <RecipientStatusCard
      relationship={relationship}
      viewedName="Daniel"
      onSendMoney={() => {}}
    />
  );

  expect(html).toMatch(/Verified recipient/);
  expect(html).toMatch(/Transfer/);
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

  expect(html).toMatch(/Your account/);
  // The self card has no transfer action button (the only <button> the card
  // ever renders is the "Transfer" action, gated on canTransferToUser).
  // NOTE: the prior assertion was not.toMatch(/Transfer/), which was a latent
  // bug — it tripped on the explanatory copy ("Transfers to yourself are not
  // possible.") rather than the action. The component already hides the action.
  expect(html).not.toMatch(/<button/i);
});

test("empty relationship state offers a safe send-money entry point", () => {
  const html = renderToStaticMarkup(
    <EmptyRelationshipState viewedName="Daniel" canSendMoney onSendMoney={() => {}} />
  );

  expect(html).toMatch(/You and Daniel have no transactions yet/);
  expect(html).toMatch(/Transfer/);
});
