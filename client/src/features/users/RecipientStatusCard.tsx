import React from "react";
import { BadgeCheck, CircleHelp, Send, UserCircle2 } from "lucide-react";
import { Button } from "../../components/Primitives";
import type { UserRelationshipSummary } from "../../lib/types";

function getStatusCopy(
  relationship: UserRelationshipSummary,
  viewedName: string
) {
  if (relationship.relationshipStatus === "self") {
    return {
      icon: <UserCircle2 aria-hidden="true" />,
      title: "Your account",
      message: "You are viewing your own profile. Transfers to yourself are not possible."
    };
  }

  if (relationship.isVerifiedRecipient) {
    return {
      icon: <BadgeCheck aria-hidden="true" />,
      title: "Verified recipient",
      message: `${viewedName} has a verified account. You can Transfer to this user.`
    };
  }

  return {
    icon: <CircleHelp aria-hidden="true" />,
    title: "Not verified yet",
    message: `${viewedName} has not verified their account yet. Transfers are still possible, but double-check the email before sending.`
  };
}

export function RecipientStatusCard({
  relationship,
  viewedName,
  onSendMoney
}: {
  relationship: UserRelationshipSummary;
  viewedName: string;
  onSendMoney: () => void;
}) {
  const copy = getStatusCopy(relationship, viewedName);

  return (
    <section className="card recipient-status-card" aria-label="Recipient status">
      <div className="recipient-status-head">
        <span
          className={
            relationship.isVerifiedRecipient &&
            relationship.relationshipStatus !== "self"
              ? "recipient-status-icon recipient-status-icon-verified"
              : "recipient-status-icon"
          }
        >
          {copy.icon}
        </span>
        <h2>{copy.title}</h2>
      </div>
      <p className="recipient-status-message">{copy.message}</p>
      {relationship.canTransferToUser ? (
        <Button type="button" onClick={onSendMoney}>
          <Send aria-hidden="true" className="user-profile-action-icon" />
          Transfer
        </Button>
      ) : null}
    </section>
  );
}
