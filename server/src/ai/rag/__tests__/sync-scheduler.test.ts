import { runScheduledRagSync } from "../sync-scheduler.js";
import type { SyncSummary } from "../ingest.js";

const SUMMARY: SyncSummary = { created: 1, updated: 0, skipped: 4, removed: 0, chunks: 9 };

function okRun() {
  const calls: Array<Record<string, unknown>> = [];
  const run = async (opts: Record<string, unknown>) => {
    calls.push(opts);
    return { summary: SUMMARY, label: "drive folder=test" };
  };
  return { calls, run };
}

function lock() {
  const released = { count: 0 };
  const release = async () => {
    released.count += 1;
  };
  return { released, release };
}

describe("runScheduledRagSync", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });
  function silenceConsole() {
    const log = console.log;
    const err = console.error;
    console.log = () => {};
    console.error = () => {};
    cleanups.push(() => {
      console.log = log;
      console.error = err;
    });
  }

  test("skips and does not run when the lock is already held", async () => {
    silenceConsole();
    const { calls, run } = okRun();
    let alerted = 0;
    await runScheduledRagSync({
      acquireLock: async () => null, // lock held by someone else
      run,
      alert: async () => {
        alerted += 1;
      }
    });
    expect(calls).toHaveLength(0);
    expect(alerted).toBe(0);
  });

  test("runs the drive sync with force:false and releases the lock", async () => {
    silenceConsole();
    const { calls, run } = okRun();
    const { released, release } = lock();
    await runScheduledRagSync({
      acquireLock: async () => release,
      run,
      alert: async () => {}
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "drive", force: false });
    expect(released.count).toBe(1);
  });

  test("emails an ops alert and still releases the lock when the sync throws", async () => {
    silenceConsole();
    const { released, release } = lock();
    let alertSubject = "";
    await runScheduledRagSync({
      acquireLock: async () => release,
      run: async () => {
        throw new Error("drive exploded");
      },
      alert: async (subject: string) => {
        alertSubject = subject;
      }
    });
    expect(alertSubject).toMatch(/RAG sync failed/i);
    expect(released.count).toBe(1);
  });
});
