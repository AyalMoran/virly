import { app } from "./app.js";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { startDailyFxRefresh } from "./services/fx.service.js";

async function bootstrap() {
  await connectDb();
  startDailyFxRefresh();
  app.listen(config.port, () => {
    console.log(`Server running on ${config.serverUrl}:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

