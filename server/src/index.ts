import { app } from "./app.js";
import { config } from "./config.js";
import { connectDb, initRepositories } from "./db.js";
import { startDailyFxRefresh } from "./services/fx.service.js";
import { startTtlSweeper } from "./ttl/sweeper.js";

async function bootstrap() {
  await connectDb();
  await initRepositories();
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

