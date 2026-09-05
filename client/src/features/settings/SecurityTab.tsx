import { lazy, Suspense, useEffect, useState } from "react";
import { LogIn, Send } from "lucide-react";
import { api } from "../../lib/api";
import { formatRelativeDate } from "../../lib/format";
import type { ActivityEventDto } from "../../lib/types";
import { Card, EmptyState, ErrorBanner, Skeleton } from "../../components/Primitives";

const ActivityMap = lazy(() => import("./ActivityMap"));

export function ActivityList({ events }: { events: ActivityEventDto[] }) {
  if (!events.length) {
    return (
      <EmptyState
        title="No activity yet"
        message="Logins and transfers will appear here with where they came from."
      />
    );
  }
  return (
    <div className="transaction-list compact">
      {events.map((event) => {
        const where = [event.city, event.country].filter(Boolean).join(", ") || "Unknown location";
        return (
          <article className="transaction-row" key={event.id}>
            <div className="direction-mark direction-in" aria-hidden="true">
              {event.kind === "login" ? <LogIn /> : <Send />}
            </div>
            <div className="transaction-main">
              <strong>{event.kind === "login" ? "Login" : "Transfer"}</strong>
              <span>{where}</span>
            </div>
            <div className="transaction-meta">
              <span>{formatRelativeDate(event.at)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function SecurityTab() {
  const [events, setEvents] = useState<ActivityEventDto[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .activity({ limit: 30 })
      .then((response) => {
        if (!cancelled) setEvents(response.events);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load recent activity.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const located = (events ?? []).filter((e) => e.lat !== null && e.lng !== null);

  return (
    <div className="security-grid">
      <Card>
        <h2>Recent activity</h2>
        <p>Where your logins and transfers came from.</p>
        {error ? <ErrorBanner message={error} /> : null}
        {events === null && !error ? <Skeleton rows={4} /> : <ActivityList events={events ?? []} />}
      </Card>
      <Card>
        <h2>Activity map</h2>
        {typeof window === "undefined" || located.length === 0 ? (
          <p className="map-placeholder">Located activity will appear on a map here.</p>
        ) : (
          <Suspense fallback={<Skeleton rows={4} />}>
            <ActivityMap events={located} />
          </Suspense>
        )}
      </Card>
    </div>
  );
}
