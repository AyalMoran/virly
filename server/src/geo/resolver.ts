// src/geo/resolver.ts
//
// GeoIpResolver port. The MaxMind GeoLite2-City database is loaded once at
// boot from config.geo.geoipDbPath; a missing/corrupt file degrades softly
// (warn once, every lookup resolves null) per the spec's fail-open rule.
import maxmind, { type CityResponse, type Reader } from "maxmind";

import { config } from "../config.js";
import type { GeoPoint } from "./types.js";

let reader: Reader<CityResponse> | null = null;

export async function initGeoResolver(): Promise<void> {
  if (!config.geo.enabled || !config.geo.geoipDbPath) return;
  try {
    reader = await maxmind.open<CityResponse>(config.geo.geoipDbPath);
  } catch (error) {
    console.warn(
      `geo: could not load GeoLite2 db at ${config.geo.geoipDbPath}; IP lookups disabled.`,
      error instanceof Error ? error.message : error
    );
    reader = null;
  }
}

/** Test seam. */
export function setGeoReaderForTests(r: Reader<CityResponse> | null): void {
  reader = r;
}

export function resolveIp(ip: string): GeoPoint | null {
  if (!reader) return null;
  try {
    const hit = reader.get(ip);
    const lat = hit?.location?.latitude;
    const lng = hit?.location?.longitude;
    const country = hit?.country?.iso_code;
    if (typeof lat !== "number" || typeof lng !== "number" || !country) return null;
    return { country, city: hit?.city?.names?.en ?? null, lat, lng };
  } catch {
    return null;
  }
}
