// src/services/activityEvent.service.ts
//
// The activity stream is an audit trail (spec 2026-07-09): events are ALWAYS
// written when the feature is enabled, geo enrichment is best-effort, and a
// failed write must never fail the login/transfer it describes.
import { config } from "../config.js";
import type { RequestOrigin } from "../geo/types.js";
import { getRepositories } from "../repositories/index.js";
import type { ActivityEventKind, ActivityEventRecord, TxContext } from "../repositories/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecordActivityInput = {
  userId: string;
  kind: ActivityEventKind;
  origin: RequestOrigin;
  transactionId?: string | null;
  now?: Date;
};

export async function recordActivityEventSafe(
  input: RecordActivityInput,
  tx?: TxContext
): Promise<ActivityEventRecord | null> {
  if (!config.geo.enabled) return null;
  const at = input.now ?? new Date();
  try {
    return await getRepositories().activityEvents.create(
      {
        userId: input.userId,
        kind: input.kind,
        at,
        ip: input.origin.ip,
        geo: input.origin.geo,
        transactionId: input.transactionId ?? null,
        expiresAt: new Date(at.getTime() + config.geo.retentionDays * DAY_MS)
      },
      tx
    );
  } catch (error) {
    console.error("activity: failed to record event", {
      userId: input.userId,
      kind: input.kind,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

export async function listActivityForUser(
  userId: string,
  opts: { limit: number; before?: Date }
): Promise<ActivityEventRecord[]> {
  return getRepositories().activityEvents.listRecentByUser(userId, opts);
}
