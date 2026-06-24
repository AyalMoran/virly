
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/repositories/postgres/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.VIRLY_POSTGRES_URL ?? "" }
});
