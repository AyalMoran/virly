// src/services/loginAlert.ts
//
// Login-time suspicion check (spec: computeRisk is transfer-scoped, so logins
// are evaluated with the same pure helpers; there is no separate login scorer).
import {
  GEO_WINDOW_DAYS,
  IMPOSSIBLE_TRAVEL_KMH,
  isNewCountry,
  travelSpeedKmh,
  type LocatedEvent
} from "../fraud/geo.js";
import type { ActivityEventGeo, ActivityEventRecord } from "../repositories/types.js";

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Reasons a just-captured login looks suspicious; empty array = no alert. */
export function evaluateLoginAlert(
  current: { geo: ActivityEventGeo | null; at: Date },
  history: ActivityEventRecord[]
): string[] {
  if (!current.geo) return [];
  const windowStart = new Date(current.at.getTime() - GEO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const located: LocatedEvent[] = history
    .filter((e) => e.geo !== null && e.at >= windowStart && e.at < current.at)
    .map((e) => ({ geo: e.geo!, at: e.at }));
  if (located.length === 0) return [];
  const reasons: string[] = [];
  const prev = located[0]!;
  if (travelSpeedKmh(prev, { geo: current.geo, at: current.at }) > IMPOSSIBLE_TRAVEL_KMH) {
    reasons.push("This login is impossibly far from your previous activity.");
  }
  if (isNewCountry(current.geo.country, located) === true) {
    reasons.push(`First activity from ${regionName(current.geo.country)}.`);
  }
  return reasons;
}
