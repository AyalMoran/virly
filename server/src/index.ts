import { app } from "./app.js";
import { config } from "./config.js";
import { connectDb, initRepositories } from "./db.js";
import { setupAiMemoryBackend } from "./ai/v2/memory/setup.js";
import { startDailyFxRefresh } from "./services/fx.service.js";
import { startTtlSweeper } from "./ttl/sweeper.js";

async function bootstrap() {
  await connectDb();
  await initRepositories();
  // Create the Postgres checkpointer/store tables when AI memory lives there (M1.5).
  await setupAiMemoryBackend();
  // Postgres has no native TTL; sweep expired conversations/pending transfers.
  if (config.dbDriver === "postgres") startTtlSweeper();
  startDailyFxRefresh();
  app.listen(config.port, () => {
    console.log(`Server running on ${config.serverUrl}:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

