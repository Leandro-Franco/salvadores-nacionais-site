import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migration credentials are separate from runtime ones (spec §17.2).
    url: process.env.DATABASE_MIGRATION_URL ?? "",
  },
  strict: true,
});
