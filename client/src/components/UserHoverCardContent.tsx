// client/src/components/UserHoverCardContent.tsx
import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";
import type { RelationshipDisplay } from "../features/users/relationship-summary";

export function UserHoverCardContent({
  email,
  state,
  summary,
  formatAmount
}: {
  email: string;
  state: "loading" | "error" | "loaded";
  summary?: RelationshipDisplay;
  formatAmount: (n: number) => string;
}) {
  if (state === "loading") {
    return <div className="user-hover-card loading">Loading…</div>;
  }
  if (state === "error" || !summary) {
    return <div className="user-hover-card error">Summary unavailable — try the full profile.</div>;
  }
  return (
    <div className="user-hover-card">
      <div className="user-hover-card-head">
        <strong>{summary.name}</strong>
        {summary.verified ? <BadgeCheck aria-label="Verified recipient" /> : null}
      </div>
      <dl className="user-hover-card-stats">
        <div>
          <dt>You sent</dt>
          <dd>{formatAmount(summary.totalSent)}</dd>
        </div>
        <div>
          <dt>You received</dt>
          <dd>{formatAmount(summary.totalReceived)}</dd>
        </div>
        <div>
          <dt>{summary.netLabel}</dt>
          <dd>{formatAmount(summary.netAmount)}</dd>
        </div>
        <div>
          <dt>Transactions</dt>
          <dd>{summary.transactionCount}</dd>
        </div>
      </dl>
      <Link className="user-hover-card-link" to={`/users/${encodeURIComponent(email)}`}>
        View full profile
      </Link>
    </div>
  );
}
