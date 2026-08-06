import { drizzle as drizzlePglite, PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, NodePgDatabase } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>;

// One database, two drivers:
//  - DATABASE_URL set (production, e.g. Neon) -> node-postgres
//  - otherwise -> embedded PGlite persisted to ./data/office-db
const globalForDb = globalThis as unknown as {
  db?: Db;
  migrated?: Promise<void>;
};

// DB_LOG=1 prints every statement with a running count, so you can see how
// many round-trips a request costs. Worth checking after touching a hot path:
// in production each one is a network hop to Neon.
const logger = process.env.DB_LOG
  ? {
      logQuery(query: string) {
        const g = globalThis as unknown as { __q?: number };
        g.__q = (g.__q ?? 0) + 1;
        console.log(`[db ${String(g.__q).padStart(3)}] ${query.slice(0, 110)}`);
      },
    }
  : undefined;

function createDb(): Db {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return drizzlePg(pool, { schema, logger });
  }
  const dataDir = path.join(process.cwd(), "data", "office-db");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  return drizzlePglite(client, { schema, logger });
}

function realDb(): Db {
  if (!globalForDb.db) globalForDb.db = createDb();
  return globalForDb.db;
}

// Lazy proxy: PGlite must not be opened at module-import time, or `next
// build` workers would open the data directory alongside the dev server and
// corrupt it. The instance is created on first actual use.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const value = (realDb() as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? value.bind(globalForDb.db) : value;
  },
});

// Run migrations once per process. Production migrates itself too: this is
// awaited at the top of the home page, getSettings and every token route, so
// a deploy applies pending migrations on its first request.
export async function ensureMigrated(): Promise<void> {
  if (!globalForDb.migrated) {
    globalForDb.migrated = (async () => {
      const migrationsFolder = path.join(process.cwd(), "drizzle");
      if (process.env.DATABASE_URL) {
        const { migrate } = await import("drizzle-orm/node-postgres/migrator");
        await migrate(db as NodePgDatabase<typeof schema>, { migrationsFolder });
      } else {
        const { migrate } = await import("drizzle-orm/pglite/migrator");
        await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder });
      }
    })().catch((err) => {
      // Don't cache a failed attempt (e.g. a transient PGlite lock during a
      // dev-server restart) — let the next request retry.
      globalForDb.migrated = undefined;
      throw err;
    });
  }
  return globalForDb.migrated;
}

export * from "./schema";
