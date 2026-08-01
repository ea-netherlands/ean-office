/**
 * Create or update the database tables.
 *
 *   npm run db:migrate                        (local PGlite)
 *   DATABASE_URL="postgres://…" npm run db:migrate   (production)
 *
 * Safe to run repeatedly — already-applied migrations are skipped.
 */
import { ensureMigrated } from "../db";

async function main() {
  const target = process.env.DATABASE_URL
    ? `remote database (${new URL(process.env.DATABASE_URL).host})`
    : "local database (data/office-db)";
  console.log(`Migrating ${target}…`);
  await ensureMigrated();
  console.log("Done — tables are up to date.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
