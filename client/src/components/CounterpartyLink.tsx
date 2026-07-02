// client/src/components/CounterpartyLink.tsx
import { useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { Link } from "react-router-dom";
import { useCurrency } from "../features/currency/CurrencyProvider";
import { fetchUserProfileCached } from "../lib/user-profile-cache";
import { summarizeRelationship, type RelationshipDisplay } from "../features/users/relationship-summary";
import { UserHoverCardContent } from "./UserHoverCardContent";

export function CounterpartyLink({
  email,
  className,
  children
}: {
  email: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { formatAmount } = useCurrency();
  const [state, setState] = useState<"idle" | "loading" | "error" | "loaded">("idle");
  const [summary, setSummary] = useState<RelationshipDisplay | undefined>();

  function load() {
    if (state === "loaded" || state === "loading") {
      return;
    }
    setState("loading");
    fetchUserProfileCached(email)
      .then((profile) => {
        setSummary(summarizeRelationship(profile));
        setState("loaded");
      })
      .catch(() => setState("error"));
  }

  return (
    <HoverCard.Root openDelay={200} closeDelay={100} onOpenChange={(open) => open && load()}>
      <HoverCard.Trigger asChild>
        <Link
          className={className ?? "counterparty-link"}
          to={`/users/${encodeURIComponent(email)}`}
          aria-label={`View ${email}'s profile`}
          onFocus={load}
        >
          {children ?? email}
        </Link>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="user-hover-card-popover" sideOffset={6} collisionPadding={8}>
          <UserHoverCardContent
            email={email}
            state={state === "idle" ? "loading" : state}
            summary={summary}
            formatAmount={formatAmount}
          />
          <HoverCard.Arrow className="user-hover-card-arrow" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
