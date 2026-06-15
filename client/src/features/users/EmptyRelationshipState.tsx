import React from "react";
import { HandCoins } from "lucide-react";
import { Button, EmptyState } from "../../components/Primitives";

export function EmptyRelationshipState({
  viewedName,
  canSendMoney,
  onSendMoney
}: {
  viewedName: string;
  canSendMoney: boolean;
  onSendMoney: () => void;
}) {
  return (
    <section className="card" aria-label="No shared history">
      <EmptyState
        title={`You and ${viewedName} have no transactions yet`}
        message="Once you send or receive money with this user, your shared activity will appear here."
        icon={<HandCoins />}
      >
        {canSendMoney ? (
          <Button type="button" onClick={onSendMoney}>
            Transfer
          </Button>
        ) : null}
      </EmptyState>
    </section>
  );
}
