import type { RequestHandler } from "express";

type ThrottleEnv = Pick<NodeJS.ProcessEnv, "VIRLY_THROTTLE_MS" | "NODE_ENV">;

/**
 * Dev-only latency simulator control. Reads VIRLY_THROTTLE_MS directly from the
 * env (documented exception to the config.ts rule; see docs/configuration.md).
 * Hard-disabled in production so a leftover value can never slow real traffic.
 */
export function resolveDevThrottleMs(env: ThrottleEnv): number {
  if (env.NODE_ENV === "production") {
    return 0;
  }
  const parsed = Number(env.VIRLY_THROTTLE_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export function devThrottleMiddleware(throttleMs: number): RequestHandler {
  return (_req, _res, next) => {
    setTimeout(next, throttleMs);
  };
}

export function warnDevThrottleActive(throttleMs: number): void {
  console.warn(
    `[virly] VIRLY_THROTTLE_MS=${throttleMs} is active: EVERY API response is delayed by ${throttleMs}ms. ` +
      "This is a dev-only latency simulator (docs/configuration.md). Unset it if pages feel slow."
  );
}
