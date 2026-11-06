import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverConfig } from "@/config/server";

let db: PostgresJsDatabase | undefined;

/** Single pooled connection per server instance. `prepare: false` keeps it compatible with Supabase's pooler. */
export function getDb(): PostgresJsDatabase {
  if (db) return db;
  const url = serverConfig().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  db = drizzle(postgres(url, { max: 5, prepare: false, idle_timeout: 20 }));
  return db;
}
