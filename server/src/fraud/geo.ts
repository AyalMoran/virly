// src/fraud/geo.ts
//
// Pure geo math for the fraud rules (spec 2026-07-09). No I/O, no config:
// deterministic and unit-testable like risk.ts. The service layer fetches
// events and calls these; computeRisk consumes the derived primitives.
import type { ActivityEventGeo } from "../repositories/types.js";

export type LocatedEvent = { geo: ActivityEventGeo; at: Date };

export const IMPOSSIBLE_TRAVEL_KMH = 900;
export const FAR_FROM_HOME_KM = 500;
export const HOME_MIN_EVENTS = 5;
export const GEO_WINDOW_DAYS = 90;

const EARTH_RADIUS_KM = 6371;
const MIN_ELAPSED_HOURS = 1 / 60; // clamp so a same-instant jump stays finite

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelSpeedKmh(
  prev: LocatedEvent,
  current: { geo: ActivityEventGeo; at: Date }
): number {
  const km = haversineKm(prev.geo, current.geo);
  const hours = Math.max((current.at.getTime() - prev.at.getTime()) / 3_600_000, MIN_ELAPSED_HOURS);
  return km / hours;
}

export function homeBaseline(
  events: LocatedEvent[],
  minEvents = HOME_MIN_EVENTS
): { lat: number; lng: number } | null {
  if (events.length < minEvents) return null;
  const clusters = new Map<string, LocatedEvent[]>();
  for (const event of events) {
    const key = `${event.geo.country}:${event.geo.city ?? ""}`;
    const bucket = clusters.get(key);
    if (bucket) bucket.push(event);
    else clusters.set(key, [event]);
  }
  let modal: LocatedEvent[] = [];
  for (const bucket of clusters.values()) {
    if (bucket.length > modal.length) modal = bucket;
  }
  const lat = modal.reduce((s, e) => s + e.geo.lat, 0) / modal.length;
  const lng = modal.reduce((s, e) => s + e.geo.lng, 0) / modal.length;
  return { lat, lng };
}

export function isNewCountry(country: string, events: LocatedEvent[]): boolean | null {
  if (events.length === 0) return null;
  return !events.some((e) => e.geo.country === country);
}
