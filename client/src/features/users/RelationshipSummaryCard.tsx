import React from "react";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/format";
import type { UserRelationshipSummary } from "../../lib/types";

export function RelationshipSummaryCard({
  relationship,
  viewedName
}: {
  relationship: UserRelationshipSummary;
  viewedName: string;
}) {
  const net = relationship.netAmount;
  const netLabel =
    net > 0
      ? "Net sent"
      : net < 0
        ? "Net received"
        : "Even";

  return (
    <section className="card" aria-label={`Activity between you and ${viewedName}`}>
      <div className="section-heading">
        <h2>Between you and {viewedName}</h2>
      </div>
      <div className="relationship-stats-grid">
        <div className="relationship-stat">
          <span className="relationship-stat-icon direction-mark direction-out" aria-hidden="true">
            <ArrowUpRight />
          </span>
          <span className="relationship-stat-label">You sent</span>
          <strong className="relationship-stat-value">
            {formatCurrency(relationship.totalSentToUser)}
          </strong>
        </div>
        <div className="relationship-stat">
          <span className="relationship-stat-icon direction-mark direction-in" aria-hidden="true">
            <ArrowDownLeft />
          </span>
          <span className="relationship-stat-label">You received</span>
          <strong className="relationship-stat-value">
            {formatCurrency(relationship.totalReceivedFromUser)}
          </strong>
        </div>
        <div className="relationship-stat">
          <span className="relationship-stat-icon direction-mark" aria-hidden="true">
            <Scale />
          </span>
          <span className="relationship-stat-label">{netLabel}</span>
          <strong className="relationship-stat-value">
            {formatCurrency(Math.abs(net))}
          </strong>
        </div>
      </div>
      <dl className="relationship-meta-list">
        <div>
          <dt>Transactions</dt>
          <dd>{relationship.transactionCount}</dd>
        </div>
        <div>
          <dt>Last interaction</dt>
          <dd>
            {relationship.lastTransactionAt
              ? formatDate(relationship.lastTransactionAt)
              : "No transactions yet"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
