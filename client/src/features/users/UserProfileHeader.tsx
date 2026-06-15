import React from "react";
import { BadgeCheck, Send } from "lucide-react";
import { Button } from "../../components/Primitives";
import type { PublicUserProfile } from "../../lib/types";
import { getUserAvatarUrl } from "../../lib/user-avatar";

function formatMemberSince(value?: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

export function UserProfileHeader({
  user,
  isSelf,
  canSendMoney,
  onSendMoney
}: {
  user: PublicUserProfile;
  isSelf: boolean;
  canSendMoney: boolean;
  onSendMoney: () => void;
}) {
  const memberSince = formatMemberSince(user.memberSince);

  return (
    <section className="card user-profile-header" aria-label="User profile">
      <img
        className="user-profile-avatar"
        src={getUserAvatarUrl(user.displayName)}
        alt=""
      />
      <div className="user-profile-identity">
        <h2 className="user-profile-name">
          {user.displayName}
          {user.isVerified ? (
            <span className="user-profile-verified">
              <BadgeCheck aria-hidden="true" />
              Verified
            </span>
          ) : null}
        </h2>
        <p className="user-profile-email">{user.email}</p>
        {memberSince ? (
          <p className="user-profile-meta">Member since {memberSince}</p>
        ) : null}
        {isSelf ? <p className="user-profile-meta">This is your profile.</p> : null}
      </div>
      {canSendMoney ? (
        <div className="user-profile-actions">
          <Button type="button" onClick={onSendMoney}>
            <Send aria-hidden="true" className="user-profile-action-icon" />
            Transfer
          </Button>
        </div>
      ) : null}
    </section>
  );
}
