/**
 * In-process scheduled Drive sync (the Todoist "scheduled idempotent RAG sync").
 *
 * Mirrors the startDailyFxRefresh / startTtlSweeper precedent: a setInterval
 * started from index.ts, unref'd so it never keeps the process alive. Each run:
 *   1. takes a pgvector advisory lock - skip if a sync is already running;
 *   2. runs rag:sync --source=drive with force:false (the corpus is already
 *      idempotent, so --force is never used here);
 *   3. emails an ops alert on failure;
 *   4. always releases the lock.
 *
 * The scheduler keeps the AI pool open (unlike the CLI) because the running
 * server also serves RAG queries from it.
 */
import { config } from "../../config.js";
import { tryAcquireAiAdvisoryLock } from "../../db/vector.js";
import { sendOpsAlertEmail } from "../../services/email.service.js";
import { runKnowledgeSync } from "./sync-runner.js";

/** Arbitrary but stable advisory-lock key reserved for the RAG sync job. */
export const RAG_SYNC_LOCK_KEY = 4_915_021;

export type ScheduledRagSyncDeps = {
  acquireLock?: (key: number) => Promise<(() => Promise<void>) | null>;
  run?: typeof runKnowledgeSync;
  alert?: (subject: string, text: string) => Promise<unknown>;
  now?: () => number;
};

/** Run one scheduled Drive sync. Collaborators are injectable for tests. */
export async function runScheduledRagSync(deps: ScheduledRagSyncDeps = {}): Promise<void> {
  const acquireLock = deps.acquireLock ?? tryAcquireAiAdvisoryLock;
  const run = deps.run ?? runKnowledgeSync;
  const alert = deps.alert ?? sendOpsAlertEmail;
  const now = deps.now ?? Date.now;

  const release = await acquireLock(RAG_SYNC_LOCK_KEY);
  if (!release) {
    console.log("[rag-sync] skipped: a sync is already running");
    return;
  }

  const startedAt = now();
  try {
    const { summary, label } = await run({
      kind: "drive",
      force: false,
      log: (m) => console.log(`[rag-sync]   ${m}`),
      onStart: ({ label: l }) => console.log(`[rag-sync] start source=${l}`)
    });
    console.log(
      `[rag-sync] done source=${label} ${summary.created} created, ${summary.updated} updated, ` +
        `${summary.skipped} skipped, ${summary.removed} removed, ${summary.chunks} chunks ` +
        `(${now() - startedAt}ms)`
    );
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("[rag-sync] failed:", detail);
    await alert("Virly RAG sync failed", `The scheduled RAG knowledge-base sync failed.\n\n${detail}`).catch(
      (e) => console.error("[rag-sync] alert email failed:", e)
    );
  } finally {
    await release().catch((e) => console.error("[rag-sync] lock release failed:", e));
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Start the periodic Drive sync. No-op when VIRLY_RAG_SYNC_ENABLED is false or
 * when already started. Runs once shortly after boot, then every intervalMs.
 * The boot run is cheap on a warm corpus because unchanged docs are skipped.
 */
export function startRagSyncScheduler(
  intervalMs: number = config.rag.sync.intervalMs
): NodeJS.Timeout | null {
  if (timer) return timer;
  if (!config.rag.sync.enabled) return null;

  void runScheduledRagSync();
  timer = setInterval(() => void runScheduledRagSync(), intervalMs);
  timer.unref();
  return timer;
}
