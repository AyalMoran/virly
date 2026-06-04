import { runAiEvalFixtures, type AiEvalMode } from "./runner.js";

function parseMode(argv: string[]): AiEvalMode {
  const modeFlagIndex = argv.findIndex((value) => value === "--mode");
  const modeValue =
    modeFlagIndex >= 0 && modeFlagIndex + 1 < argv.length
      ? argv[modeFlagIndex + 1]
      : "deterministic";

  if (
    modeValue !== "deterministic" &&
    modeValue !== "llm-dev" &&
    modeValue !== "seeded-mongo"
  ) {
    throw new Error(`Unsupported eval mode: ${modeValue}`);
  }

  return modeValue;
}

async function main() {
  const summary = await runAiEvalFixtures({
    mode: parseMode(process.argv.slice(2))
  });

  if (summary.failedTurns.length > 0) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        mode: summary.mode,
        totalFixtures: summary.totalFixtures,
        totalScenarios: summary.totalScenarios,
        totalTurns: summary.totalTurns,
        failedTurns: 0
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown eval runner error"
  );
  process.exit(1);
});
