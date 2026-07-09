/**
 * Sync the RAG knowledge base from a source into pgvector (RAG_PLAN.md §4).
 *
 * Run from server/:
 *   npm run rag:sync -- --source=drive                 # sync the Drive folder (M2)
 *   npm run rag:sync -- --source=local --dir=/abs/path # sync a local folder (M1)
 *   npm run rag:sync -- ... --dry-run                  # show the plan, write nothing
 *   npm run rag:sync -- ... --force                    # re-embed even unchanged files
 *
 * Drive uses VIRLY_RAG_DRIVE_FOLDER_ID + a service account
 * (VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON or VIRLY_GOOGLE_APPLICATION_CREDENTIALS).
 * Local uses --dir or VIRLY_RAG_LOCAL_DIR. Both require VIRLY_AI_PG_URL and,
 * unless --dry-run, OPENAI_API_KEY.
 *
 * The source-building + orchestration live in src/ai/rag/sync-runner.ts so the
 * in-process scheduler can reuse them; this file is just the CLI shell.
 */
import { closeAiPool } from "../src/db/vector.js";
import { runKnowledgeSync, type KnowledgeSourceKind } from "../src/ai/rag/sync-runner.js";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const kind = (getFlag("source") ?? "drive") as KnowledgeSourceKind;

  const { summary } = await runKnowledgeSync({
    kind,
    dir: getFlag("dir"),
    folderId: getFlag("folder"),
    category: getFlag("category"),
    dryRun: hasFlag("dry-run"),
    force: hasFlag("force"),
    log: (m) => console.log(`  ${m}`),
    onStart: ({ label, dryRun }) =>
      console.log(`Knowledge sync — source=${label}${dryRun ? " [dry-run]" : ""}`)
  });

  console.log(
    `Done: ${summary.created} created, ${summary.updated} updated, ` +
      `${summary.skipped} skipped, ${summary.removed} removed, ${summary.chunks} chunks.`
  );
}

main()
  .then(() => closeAiPool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeAiPool().catch(() => {});
    process.exit(1);
  });
