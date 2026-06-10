import React, { useCallback, useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  PageStack,
  ResponsiveGrid,
  Skeleton
} from "../../components/Primitives";
import { ApiError, api } from "../../lib/api";
import type { UserProfileResponse } from "../../lib/types";
import { EmptyRelationshipState } from "./EmptyRelationshipState";
import { RecentRelationshipTransactions } from "./RecentRelationshipTransactions";
import { RecipientStatusCard } from "./RecipientStatusCard";
import { RelationshipSummaryCard } from "./RelationshipSummaryCard";
import { UserProfileHeader } from "./UserProfileHeader";

type ProfileError = {
  status: number | null;
  message: string;
};

export function UserProfilePage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState<ProfileError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    api
      .userProfile(userId)
      .then((response) => {
        if (active) {
          setProfile(response);
        }
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return;
        }

        if (loadError instanceof ApiError) {
          setError({ status: loadError.status, message: loadError.message });
        } else {
          setError({ status: null, message: "Unable to load this profile." });
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const handleSendMoney = useCallback(() => {
    if (!profile) {
      return;
    }

    // Reuses the established transfer-prefill handoff (see QuickContacts):
    // only preselects the recipient — amount entry, review, and submission
    // all stay inside the existing transfer flow.
    sessionStorage.setItem("virly-prefill-recipient", profile.user.email);
    navigate("/transfer");
  }, [navigate, profile]);

  if (isLoading) {
    return (
      <PageStack>
        <PageHeader eyebrow="Profile" title="Loading profile" />
        <Skeleton rows={4} />
      </PageStack>
    );
  }

  if (error) {
    if (error.status === 404) {
      return (
        <PageStack>
          <PageHeader eyebrow="Profile" title="User not found" />
          <Card>
            <EmptyState
              title="This profile is not available"
              message="The user may not exist or may no longer be available."
              icon={<UserX />}
            >
              <Link className="button button-primary" to="/transactions">
                Back to transactions
              </Link>
            </EmptyState>
          </Card>
        </PageStack>
      );
    }

    return (
      <PageStack>
        <PageHeader eyebrow="Profile" title="Profile" />
        <ErrorBanner message={error.message} />
        <div className="button-row">
          <Button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </Button>
        </div>
      </PageStack>
    );
  }

  if (!profile) {
    return null;
  }

  const { user, relationship, recentTransactions } = profile;
  const isSelf = relationship.relationshipStatus === "self";
  const hasHistory = relationship.transactionCount > 0;

  return (
    <PageStack>
      <PageHeader eyebrow="Profile" title={user.displayName} />
      <ResponsiveGrid variant="sidebar">
        <div className="page-stack">
          <UserProfileHeader
            user={user}
            isSelf={isSelf}
            canSendMoney={relationship.canTransferToUser}
            onSendMoney={handleSendMoney}
          />
          {isSelf ? (
            <Card>
              <div className="section-heading">
                <h2>Your account</h2>
              </div>
              <p className="user-profile-self-hint">
                Relationship insights are shown when you visit other users.
                Manage your own account from these pages instead.
              </p>
              <div className="button-row">
                <Link className="button button-secondary" to="/dashboard">
                  Account summary
                </Link>
                <Link className="button button-secondary" to="/transactions">
                  Transaction history
                </Link>
                <Link className="button button-secondary" to="/settings">
                  Settings
                </Link>
              </div>
            </Card>
          ) : hasHistory ? (
            <>
              <RelationshipSummaryCard
                relationship={relationship}
                viewedName={user.displayName}
              />
              <RecentRelationshipTransactions
                idOrEmail={userId}
                initialTransactions={recentTransactions}
                totalCount={relationship.transactionCount}
                viewedName={user.displayName}
              />
            </>
          ) : (
            <EmptyRelationshipState
              viewedName={user.displayName}
              canSendMoney={relationship.canTransferToUser}
              onSendMoney={handleSendMoney}
            />
          )}
        </div>
        {!isSelf ? (
          <aside className="page-stack">
            <RecipientStatusCard
              relationship={relationship}
              viewedName={user.displayName}
              onSendMoney={handleSendMoney}
            />
          </aside>
        ) : null}
      </ResponsiveGrid>
    </PageStack>
  );
}
