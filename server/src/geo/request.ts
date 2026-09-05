// src/geo/request.ts
import type { Request } from "express";

import { config } from "../config.js";
import { resolveIp } from "./resolver.js";
import { parseDevGeoHeader } from "./simulation.js";
import type { RequestOrigin } from "./types.js";

export const DEV_GEO_HEADER = "X-Virly-Dev-Geo";

/**
 * Where did this request come from? IP always (trust proxy is set in app.ts),
 * geo best-effort: the dev simulation header when enabled (config.ts already
 * refuses simulation in production), else the mmdb lookup.
 */
export function resolveRequestOrigin(req: Request): RequestOrigin {
  const ip = req.ip ?? null;
  if (config.geo.simulationEnabled) {
    const simulated = parseDevGeoHeader(req.header(DEV_GEO_HEADER));
    if (simulated) return { ip, geo: simulated };
  }
  if (!ip) return { ip: null, geo: null };
  return { ip, geo: resolveIp(ip) };
}
